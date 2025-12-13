import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { getFriendsList } from '../../services/api/friendApi.js'
import { subscribePrivateChat, sendPrivateChat, connectChatWebSocket, removeChatWebSocketCallbacks } from '../../services/ws/chatSocket.js'
import { get, post } from '../../services/api/apiClient.js'

const STORAGE_KEY = 'globalChatDrawerOpen'
const DEFAULT_AVATAR = '/images/avatar-default.png'

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random()}`
}

function formatTime(ts) {
  const date = ts instanceof Date ? ts : new Date(ts)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 格式化相对时间（用于显示最后互动时间）
function formatRelativeTime(timestamp) {
  if (!timestamp) return null
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 7) {
    // 超过7天显示具体日期
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } else if (days > 0) {
    return `${days}天前`
  } else if (hours > 0) {
    return `${hours}小时前`
  } else if (minutes > 0) {
    return `${minutes}分钟前`
  } else {
    return '刚刚'
  }
}

function getInitials(text) {
  if (!text) return 'C'
  const letters = text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
  return letters.slice(0, 2).toUpperCase()
}

const GlobalChat = () => {
  const { isAuthenticated, user } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('chats') // 'friends' | 'chats' - 默认显示最近聊天
  const [threads, setThreads] = useState([])
  const [messagesByThread, setMessagesByThread] = useState({})
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [friends, setFriends] = useState([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const activeThreadIdRef = useRef(null) // 用于在 WebSocket 回调中访问最新的 activeThreadId
  const hasUnread = useMemo(() => threads.some((t) => (t.unread || 0) > 0), [threads])
  
  // 当前用户ID（用于判断消息发送者）
  const currentUserId = useMemo(() => {
    return user?.userId || user?.systemUserId || null
  }, [user])

  // 存储 threadId 到 sessionId 的映射（用于标记已读）
  const [threadIdToSessionId, setThreadIdToSessionId] = useState({})

  // 标记会话为已读的辅助函数
  const markSessionAsRead = useCallback(async (threadId, friendId) => {
    // 如果已有 sessionId 映射，直接使用
    let sessionId = threadIdToSessionId[threadId]
    
    if (!sessionId) {
      // 通过 friendId 查询私聊会话的 sessionId（仅查询，不创建）
      try {
        const response = await get(`/chat-service/api/sessions/private/${friendId}`)
        if (response && response.sessionId) {
          sessionId = response.sessionId
          setThreadIdToSessionId(prev => ({ ...prev, [threadId]: sessionId }))
        }
      } catch (error) {
        // 如果返回 404，说明会话不存在（还没有发送过消息），这是正常的，不需要标记已读
        if (error?.response?.status === 404) {
          console.log('[GlobalChat] 会话不存在（还没有发送过消息），跳过标记已读: friendId=', friendId)
          return
        }
        console.warn('获取会话ID失败', error)
        // 如果获取失败，尝试从会话列表获取（降级方案）
        try {
          const sessionsResponse = await get('/chat-service/api/sessions')
          if (sessionsResponse && Array.isArray(sessionsResponse)) {
            const session = sessionsResponse.find(s => 
              s.sessionType === 'PRIVATE' && s.otherUserId === friendId
            )
            if (session) {
              sessionId = session.sessionId
              setThreadIdToSessionId(prev => ({ ...prev, [threadId]: sessionId }))
            }
          }
        } catch (e) {
          console.warn('从会话列表获取sessionId失败', e)
        }
      }
    }
    
    // 如果有 sessionId，调用标记已读API
    if (sessionId) {
      try {
        await post(`/chat-service/api/sessions/${sessionId}/read`)
        console.log('[GlobalChat] 标记消息已读成功: sessionId=', sessionId, 'friendId=', friendId)
      } catch (error) {
        console.warn('[GlobalChat] 标记消息已读失败: sessionId=', sessionId, 'error=', error)
      }
    } else {
      // 会话不存在（还没有发送过消息），不需要标记已读，这是正常的
      console.log('[GlobalChat] 会话不存在（还没有发送过消息），跳过标记已读: friendId=', friendId)
    }
  }, [threadIdToSessionId])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'true') {
        setDrawerOpen(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const persistDrawer = useCallback((next) => {
    setDrawerOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        setDrawerOpen(event.newValue === 'true')
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // 加载好友列表
  useEffect(() => {
    if (!isAuthenticated) {
      setFriends([])
      return
    }
    
    let cancelled = false
    setFriendsLoading(true)
    ;(async () => {
      try {
        const friendsList = await getFriendsList()
        if (!cancelled) {
          console.log('[GlobalChat] 加载好友列表成功，数量:', friendsList?.length || 0, friendsList)
          // 按最后互动时间排序
          const sorted = (friendsList || []).sort((a, b) => {
            const aTime = a.lastInteractionTime ? new Date(a.lastInteractionTime).getTime() : 0
            const bTime = b.lastInteractionTime ? new Date(b.lastInteractionTime).getTime() : 0
            return bTime - aTime
          })
          setFriends(sorted)
        }
      } catch (error) {
        console.error('[GlobalChat] 加载好友列表失败', error?.message || error, error)
        if (!cancelled) {
          setFriends([])
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false)
        }
      }
    })()
    
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // 加载会话列表（包含未读数）
  // 注意：不依赖 friends，避免重复加载。好友信息通过单独的 useEffect 更新
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    
    let cancelled = false
    ;(async () => {
      try {
        const sessionsResponse = await get('/chat-service/api/sessions')
        if (!cancelled && sessionsResponse && Array.isArray(sessionsResponse)) {
          console.log('[GlobalChat] 加载会话列表成功，数量:', sessionsResponse.length, sessionsResponse)
          
          // 将会话列表转换为 threads，并建立 friendId 到 sessionId 的映射
          const newThreads = []
          const newThreadIdToSessionId = {}
          
          sessionsResponse.forEach(session => {
            // 只处理私聊会话
            if (session.sessionType === 'PRIVATE' && session.otherUserId) {
              const threadId = `friend_${session.otherUserId}`
              
              // 建立映射
              newThreadIdToSessionId[threadId] = session.sessionId
              
              // 优先使用后端返回的用户信息，如果没有则从好友列表查找，最后使用默认值
              const displayName = session.otherUserNickname 
                || (() => {
                    const friend = friends.find(f => f.friendId === session.otherUserId)
                    return friend?.friendNickname || friend?.friendInfo?.nickname || friend?.friendInfo?.username
                  })()
                || `用户${session.otherUserId.substring(0, 8)}`
              
              const avatar = session.otherUserAvatarUrl 
                || (() => {
                    const friend = friends.find(f => f.friendId === session.otherUserId)
                    return friend?.friendInfo?.avatarUrl
                  })()
                || DEFAULT_AVATAR
              
              // 创建或更新 thread
              newThreads.push({
                id: threadId,
                title: displayName,
                avatar: avatar,
                avatarColor: '#4f46e5',
                lastMessage: session.lastMessage || null,
                lastTime: session.lastMessageTime ? new Date(session.lastMessageTime) : null,
                unread: session.unreadCount || 0,
              })
            }
          })
          
          if (!cancelled) {
            setThreadIdToSessionId(prev => ({ ...prev, ...newThreadIdToSessionId }))
            // 合并到现有 threads（保留前端本地创建的 threads）
            // 注意：刷新页面时，prev 可能为空，此时直接使用 newThreads
            setThreads(prev => {
              if (prev.length === 0) {
                // 刷新页面时，直接使用新加载的会话列表
                return newThreads
              }
              // 有本地会话时，合并去重（以新加载的为准，更新已有会话的信息）
              const existingThreadMap = new Map(prev.map(t => [t.id, t]))
              newThreads.forEach(newThread => {
                existingThreadMap.set(newThread.id, newThread)
              })
              // 保留本地创建的会话（不在新加载列表中的）
              const localThreads = prev.filter(t => !newThreads.some(nt => nt.id === t.id))
              return [...Array.from(existingThreadMap.values()), ...localThreads]
            })
          }
        }
      } catch (error) {
        console.warn('[GlobalChat] 加载会话列表失败', error)
        // 静默失败，不影响好友列表显示
      }
    })()
    
    return () => {
      cancelled = true
    }
  }, [isAuthenticated]) // 移除 friends 依赖，避免重复加载
  
  // 当好友列表加载完成后，更新会话的显示名称和头像（仅当后端没有返回用户信息时）
  useEffect(() => {
    if (friends.length === 0) {
      return
    }
    
    setThreads(prev => prev.map(thread => {
      // 只更新 friend_ 开头的会话
      if (!thread.id.startsWith('friend_')) {
        return thread
      }
      
      // 如果已经有后端返回的用户信息（不是默认值），则不更新
      // 判断标准：如果 title 不是 "用户..." 格式，说明已经有后端返回的信息
      const friendId = thread.id.replace('friend_', '')
      const isDefaultName = thread.title === `用户${friendId.substring(0, 8)}`
      const isDefaultAvatar = thread.avatar === DEFAULT_AVATAR
      
      // 只有当前是默认值时才从好友列表更新
      if (isDefaultName || isDefaultAvatar) {
        const friend = friends.find(f => f.friendId === friendId)
        
        if (friend) {
          const displayName = friend.friendNickname || friend.friendInfo?.nickname || friend.friendInfo?.username || thread.title
          const avatar = friend.friendInfo?.avatarUrl || thread.avatar
          
          // 如果名称或头像有变化，才更新
          if (thread.title !== displayName || thread.avatar !== avatar) {
            return { ...thread, title: displayName, avatar: avatar }
          }
        }
      }
      
      return thread
    }))
  }, [friends])

  const ensureThread = useCallback((threadId, meta = {}) => {
    setThreads((prev) => {
      const existed = prev.find((t) => t.id === threadId)
      if (existed) {
        return prev.map((t) => (t.id === threadId ? { ...t, ...meta } : t))
      }
      const nextThread = { ...meta, id: threadId, unread: 0 }
      return [nextThread, ...prev]
    })
  }, [])

  const addMessage = useCallback(
    ({ text, type = 'self', timestamp = new Date(), threadId, meta = {}, isHistory = false }) => {
      if (!threadId) return
      const ts = timestamp instanceof Date ? timestamp : new Date(timestamp)
      const msg = {
        id: createId(),
        text,
        type, // 只支持 'self'（自己发送）和 'other'（对方发送）
        timestamp: ts,
        timestampLabel: formatTime(ts),
      }

      setMessagesByThread((prev) => {
        const list = prev[threadId] || []
        return { ...prev, [threadId]: [...list, msg] }
      })

      setThreads((prev) => {
        const existed = prev.find((t) => t.id === threadId)
        // 只有对方发送的消息才增加未读数，自己发送的、当前正在查看的会话、或历史消息不增加
        const unreadIncrement = (type === 'self' || activeThreadId === threadId || isHistory) ? 0 : 1
        const base = existed || { id: threadId, ...meta }
        const updated = {
          ...base,
          ...meta,
          lastMessage: text,
          lastTime: ts,
          unread: Math.max(0, (base.unread || 0) + unreadIncrement),
        }
        const others = prev.filter((t) => t.id !== threadId)
        return [updated, ...others]
      })
    },
    [activeThreadId],
  )

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messagesByThread, activeThreadId])

  useEffect(() => {
    window.addChatMessage = (text, type = 'self', timestamp, threadId, meta = {}) => {
      if (!threadId) {
        console.warn('addChatMessage: threadId is required')
        return
      }
      addMessage({ text, type, timestamp, threadId, meta })
    }
    window.registerChatThread = (threadId, meta = {}) => {
      ensureThread(threadId, meta)
    }
    return () => {
      delete window.addChatMessage
      delete window.registerChatThread
    }
  }, [addMessage, ensureThread])

  // 连接 WebSocket 并订阅私聊消息
  useEffect(() => {
    if (!isAuthenticated || !currentUserId) {
      return
    }

    let unsubscribePrivateChat = null

    // 创建 WebSocket 连接回调
    const callbacks = {
      onConnect: () => {
        // WebSocket 连接成功后，订阅私聊消息
        try {
          unsubscribePrivateChat = subscribePrivateChat((payload) => {
            // 收到私聊消息
            if (payload.type !== 'PRIVATE' || !payload.senderId || !payload.targetUserId) {
              return
            }

            // 确定是发送给我的消息
            const isForMe = payload.targetUserId === currentUserId || String(payload.targetUserId) === String(currentUserId)
            if (!isForMe) {
              return
            }

            // 构建会话ID（与 handleFriendClick 中的格式一致）
            const senderId = payload.senderId
            const threadId = `friend_${senderId}`

            // 确保会话存在（不设置固定的 subtitle，让 lastMessage 自动显示）
            const senderInfo = payload.senderName || senderId
            ensureThread(threadId, {
              title: senderInfo,
              avatarColor: '#4f46e5',
            })

            // 添加消息（对方发送的消息，type 为 'other'）
            addMessage({
              text: payload.content || '',
              type: 'other',
              timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
              threadId,
            })

            // 如果当前会话是活动会话，自动标记为已读
            // 这样当对话框一直开着时，新消息会自动标记为已读
            // 使用 ref 获取最新的 activeThreadId，避免闭包问题
            if (activeThreadIdRef.current === threadId) {
              markSessionAsRead(threadId, senderId).catch((error) => {
                console.warn('[GlobalChat] 收到新消息时自动标记已读失败', error)
              })
            }
          })
        } catch (error) {
          console.warn('订阅私聊消息失败', error)
        }
      },
      onDisconnect: () => {
        // 连接断开时清理订阅
        if (unsubscribePrivateChat) {
          try {
            unsubscribePrivateChat()
          } catch {
            // ignore
          }
          unsubscribePrivateChat = null
        }
      },
      onNotify: (notify) => {
        // 全局通知 -> 广播给 Header 通知铃铛
        try {
          const event = new CustomEvent('gh-notify', { detail: notify })
          window.dispatchEvent(event)
        } catch {
          // ignore
        }
      },
    }

    // 连接 WebSocket
    connectChatWebSocket(callbacks)

    return () => {
      // 清理订阅
      if (unsubscribePrivateChat) {
        try {
          unsubscribePrivateChat()
        } catch {
          // ignore
        }
      }
      // 移除回调监听器（不断开连接，因为可能有其他监听器在使用）
      removeChatWebSocketCallbacks(callbacks)
    }
  }, [isAuthenticated, currentUserId, addMessage, ensureThread, markSessionAsRead])

  const handleToggleDrawer = () => {
    persistDrawer(!drawerOpen)
  }

  const handleOpenThread = useCallback(async (threadId) => {
    setActiveThreadId(threadId)
    activeThreadIdRef.current = threadId // 同步更新 ref
    // 前端本地更新未读数
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    
    // 如果是私聊会话，加载历史消息并标记为已读
    if (threadId.startsWith('friend_')) {
      const friendId = threadId.replace('friend_', '')
      
      // 加载私聊历史（如果还没有加载过）
      if (!messagesByThread[threadId] || messagesByThread[threadId].length === 0) {
        try {
          const response = await get(`/chat-service/api/private/${friendId}/history?limit=100`)
          if (response && Array.isArray(response)) {
            // 将历史消息添加到会话中（按时间顺序）
            // 注意：历史消息不应该增加未读数，所以传递 isHistory: true
            response.forEach((msg) => {
              const isSelf = currentUserId && (msg.senderId === currentUserId || String(msg.senderId) === String(currentUserId))
              addMessage({
                text: msg.content || '',
                type: isSelf ? 'self' : 'other',
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                threadId,
                isHistory: true, // 标记为历史消息，不增加未读数
              })
            })
          }
        } catch (error) {
          console.warn('[GlobalChat] 加载私聊历史失败', error)
          // 静默失败，不影响用户体验
        }
      }
      
      // 标记消息为已读
      await markSessionAsRead(threadId, friendId)
    }
  }, [messagesByThread, currentUserId, addMessage, markSessionAsRead])

  const handleCloseThread = () => {
    setActiveThreadId(null)
    activeThreadIdRef.current = null // 同步更新 ref
  }

  const handleInputChange = (threadId, value) => {
    setDrafts((prev) => ({ ...prev, [threadId]: value }))
  }

  const handleSend = () => {
    if (!activeThreadId) return
    const text = (drafts[activeThreadId] || '').trim()
    if (!text) return

    // 判断是否是私聊会话（threadId 格式为 friend_{friendId}）
    const isPrivateChat = activeThreadId.startsWith('friend_')
    
    if (isPrivateChat) {
      // 私聊消息：通过 WebSocket 发送
      const friendId = activeThreadId.replace('friend_', '')
      if (!friendId || !currentUserId) {
        console.warn('私聊消息发送失败：缺少 friendId 或 currentUserId')
        return
      }
      
      try {
        // 先本地显示（乐观更新）
        addMessage({ text, type: 'self', threadId: activeThreadId })
        setDrafts((prev) => ({ ...prev, [activeThreadId]: '' }))
        
        // 通过 WebSocket 发送
        sendPrivateChat(friendId, text)
      } catch (error) {
        console.error('发送私聊消息失败', error)
        // 如果发送失败，可以考虑回滚本地消息
      }
    } else {
      // 其他类型的消息（暂时只支持私聊）
      addMessage({ text, type: 'self', threadId: activeThreadId })
      setDrafts((prev) => ({ ...prev, [activeThreadId]: '' }))
    }
  }

  // 点击好友，切换到私聊会话
  const handleFriendClick = useCallback(async (friend) => {
    if (!friend?.friendId) return
    
    const friendId = friend.friendId
    const friendInfo = friend.friendInfo || {}
    const displayName = friend.friendNickname || friendInfo.nickname || friendInfo.username || '好友'
    const avatar = friendInfo.avatarUrl || DEFAULT_AVATAR
    
    // 创建或切换到该好友的会话（不设置固定的 subtitle，让 lastMessage 自动显示）
    const threadId = `friend_${friendId}`
    ensureThread(threadId, {
      title: displayName,
      avatar: avatar,
      avatarColor: '#4f46e5',
    })
    
    setActiveThreadId(threadId)
    activeThreadIdRef.current = threadId // 同步更新 ref
    setActiveTab('chats') // 切换到聊天Tab

    // 加载私聊历史（如果还没有加载过）
    if (!messagesByThread[threadId] || messagesByThread[threadId].length === 0) {
      try {
        const response = await get(`/chat-service/api/private/${friendId}/history?limit=100`)
        if (response && Array.isArray(response)) {
          // 将历史消息添加到会话中（按时间顺序）
          // 注意：历史消息不应该增加未读数，所以传递 isHistory: true
          response.forEach((msg) => {
            const isSelf = currentUserId && (msg.senderId === currentUserId || String(msg.senderId) === String(currentUserId))
            addMessage({
              text: msg.content || '',
              type: isSelf ? 'self' : 'other',
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              threadId,
              isHistory: true, // 标记为历史消息，不增加未读数
            })
          })
        }
      } catch (error) {
        console.warn('加载私聊历史失败', error)
        // 静默失败，不影响用户体验
      }
    }

    // 标记消息为已读（调用后端API，并等待完成）
    // 注意：这里需要等待标记已读完成，然后更新前端的未读数
    markSessionAsRead(threadId, friendId).then(() => {
      // 标记已读成功后，更新前端的未读数
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    }).catch((error) => {
      console.warn('[GlobalChat] 标记已读失败，但继续执行', error)
    })
  }, [ensureThread, currentUserId, messagesByThread, addMessage, markSessionAsRead, friends])

  const sortedThreads = useMemo(
    () =>
      [...threads].sort((a, b) => {
        if (a.lastTime && b.lastTime) {
          return new Date(b.lastTime) - new Date(a.lastTime)
        }
        if (a.lastTime) return -1
        if (b.lastTime) return 1
        return 0
      }),
    [threads],
  )

  const activeMessages = messagesByThread[activeThreadId] || []
  const activeThread = threads.find((t) => t.id === activeThreadId)

  return (
    <div className="chat-widget" id="globalChatWidget">
      {!drawerOpen && (
        <div
          className={`chat-launcher ${hasUnread ? 'has-unread' : ''}`}
          id="globalChatLauncher"
          onClick={handleToggleDrawer}
          role="button"
          tabIndex={0}
        >
          <div className="chat-launcher-icon">💬</div>
          <div className="chat-launcher-text sr-only">Chats</div>
        </div>
      )}

      {drawerOpen && (
        <div className="chat-drawer open" id="globalChatDrawer">
          <div className="chat-drawer-header">
            <div className="chat-drawer-title">
              <div className="chat-drawer-icon">💬</div>
              <div>
                <div className="chat-drawer-text">Chats</div>
                <div className="chat-drawer-subtitle">Messaging</div>
              </div>
            </div>
            <button className="chat-drawer-close" type="button" onClick={handleToggleDrawer}>
              ✕
            </button>
          </div>
          
          {/* Tab切换 */}
          <div className="chat-tabs">
            <button
              className={`chat-tab ${activeTab === 'friends' ? 'active' : ''}`}
              onClick={() => setActiveTab('friends')}
            >
              好友列表
            </button>
            <button
              className={`chat-tab ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              最近聊天
            </button>
          </div>

          {/* 好友列表Tab */}
          {activeTab === 'friends' && (
            <div className="chat-thread-list">
              {friendsLoading ? (
                <div className="chat-empty">加载中...</div>
              ) : friends.length === 0 ? (
                <div className="chat-empty">暂无好友</div>
              ) : (
                friends.map((friend) => {
                  const friendInfo = friend.friendInfo || {}
                  const displayName = friend.friendNickname || friendInfo.nickname || friendInfo.username || '好友'
                  const avatar = friendInfo.avatarUrl || DEFAULT_AVATAR
                  const bio = friendInfo.bio || friendInfo.signature || ''
                  const playerId = friendInfo.playerId
                  const lastInteractionTime = friend.lastInteractionTime
                  const isFavorite = friend.isFavorite === true
                  
                  // 优先显示个人简介，其次显示玩家ID，最后显示最后互动时间
                  let subtitle = ''
                  if (bio) {
                    subtitle = bio.length > 20 ? bio.substring(0, 20) + '...' : bio
                  } else if (playerId) {
                    subtitle = `玩家ID: ${playerId}`
                  } else if (lastInteractionTime) {
                    subtitle = `最后互动: ${formatRelativeTime(lastInteractionTime)}`
                  }
                  
                  return (
                    <button
                      key={friend.friendId}
                      type="button"
                      className="chat-thread-item"
                      onClick={() => handleFriendClick(friend)}
                    >
                      <div className="chat-thread-avatar">
                        <img src={avatar} alt={displayName} />
                        {isFavorite && (
                          <span className="friend-favorite-indicator" title="特别关心">⭐</span>
                        )}
                      </div>
                      <div className="chat-thread-content">
                        <div className="chat-thread-top">
                          <div className="chat-thread-title">{displayName}</div>
                        </div>
                        {subtitle && (
                          <div className="chat-thread-bottom">
                            <div className="chat-thread-subtitle">{subtitle}</div>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* 最近聊天Tab */}
          {activeTab === 'chats' && (
            <div className="chat-thread-list">
              {sortedThreads.length === 0 && <div className="chat-empty">暂无会话</div>}
              {sortedThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className="chat-thread-item"
                  onClick={() => handleOpenThread(thread.id)}
                >
                  <div className="chat-thread-avatar" style={{ backgroundColor: thread.avatarColor || '#4f46e5' }}>
                    {thread.avatar ? <img src={thread.avatar} alt={thread.title} /> : getInitials(thread.title)}
                  </div>
                  <div className="chat-thread-content">
                    <div className="chat-thread-top">
                      <div className="chat-thread-title">{thread.title || '未命名会话'}</div>
                      {thread.lastTime && <div className="chat-thread-time">{formatTime(thread.lastTime)}</div>}
                    </div>
                    <div className="chat-thread-bottom">
                      <div className="chat-thread-subtitle">
                        {thread.lastMessage 
                          ? (thread.lastMessage.length > 30 
                              ? thread.lastMessage.substring(0, 30) + '...' 
                              : thread.lastMessage)
                          : (thread.subtitle || '点击查看对话')}
                      </div>
                      {thread.unread > 0 && <span className="chat-thread-unread">{thread.unread}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeThreadId && (
        <div className="chat-thread-window open" id="globalChatThreadWindow">
          <div className="chat-thread-window-header">
            <div className="chat-thread-header-left">
              <div
                className="chat-thread-avatar"
                style={{ backgroundColor: activeThread?.avatarColor || '#4f46e5' }}
              >
                {activeThread?.avatar ? (
                  <img src={activeThread.avatar} alt={activeThread.title} />
                ) : (
                  getInitials(activeThread?.title)
                )}
              </div>
              <div>
                <div className="chat-thread-title">{activeThread?.title || '会话'}</div>
                <div className="chat-thread-subtitle">{activeThread?.subtitle || '对话内容'}</div>
              </div>
            </div>
            <button className="chat-drawer-close" type="button" onClick={handleCloseThread}>
              ✕
            </button>
          </div>

          <div className="chat-messages" id="globalChatMessages">
            {activeMessages.length === 0 && <div className="chat-empty">暂无消息，开始对话吧</div>}
            {activeMessages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.type}`}>
                <div className="chat-bubble">{msg.text}</div>
                {msg.timestampLabel && <div className="chat-timestamp">{msg.timestampLabel}</div>}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              id="globalChatInput"
              className="chat-input"
              type="text"
              placeholder="输入消息..."
              value={drafts[activeThreadId] || ''}
              onChange={(event) => handleInputChange(activeThreadId, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSend()
                }
              }}
            />
            <button id="globalChatSend" className="chat-send" type="button" onClick={handleSend}>
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GlobalChat

