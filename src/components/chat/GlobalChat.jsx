import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { getFriendsList } from '../../services/api/friendApi.js'

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
  const { isAuthenticated } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('friends') // 'friends' | 'chats'
  const [threads, setThreads] = useState([])
  const [messagesByThread, setMessagesByThread] = useState({})
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [friends, setFriends] = useState([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const hasUnread = useMemo(() => threads.some((t) => (t.unread || 0) > 0), [threads])

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
    ({ text, type = 'self', timestamp = new Date(), threadId, meta = {} }) => {
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
        // 只有对方发送的消息才增加未读数，自己发送的或当前正在查看的会话不增加
        const unreadIncrement = type === 'self' || activeThreadId === threadId ? 0 : 1
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

  const handleToggleDrawer = () => {
    persistDrawer(!drawerOpen)
  }

  const handleOpenThread = (threadId) => {
    setActiveThreadId(threadId)
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
  }

  const handleCloseThread = () => {
    setActiveThreadId(null)
  }

  const handleInputChange = (threadId, value) => {
    setDrafts((prev) => ({ ...prev, [threadId]: value }))
  }

  const handleSend = () => {
    if (!activeThreadId) return
    const text = (drafts[activeThreadId] || '').trim()
    if (!text) return
    addMessage({ text, type: 'self', threadId: activeThreadId })
    setDrafts((prev) => ({ ...prev, [activeThreadId]: '' }))
  }

  // 点击好友，切换到私聊会话
  const handleFriendClick = useCallback((friend) => {
    if (!friend?.friendId) return
    
    const friendId = friend.friendId
    const friendInfo = friend.friendInfo || {}
    const displayName = friend.friendNickname || friendInfo.nickname || friendInfo.username || '好友'
    const avatar = friendInfo.avatarUrl || DEFAULT_AVATAR
    
    // 创建或切换到该好友的会话
    const threadId = `friend_${friendId}`
    ensureThread(threadId, {
      title: displayName,
      subtitle: '私聊',
      avatar: avatar,
      avatarColor: '#4f46e5',
    })
    
    setActiveThreadId(threadId)
    setActiveTab('chats') // 切换到聊天Tab
  }, [ensureThread])

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
                      <div className="chat-thread-subtitle">{thread.subtitle || '点击查看对话'}</div>
                      {thread.unread > 0 && <span className="chat-thread-unread">{thread.unread}</span>}
                    </div>
                    {thread.lastMessage && <div className="chat-thread-last">{thread.lastMessage}</div>}
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

