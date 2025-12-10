import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'globalChatDrawerOpen'
const SYSTEM_MESSAGE = 'system'
const DEFAULT_THREAD = {
  id: 'default',
  title: 'Chats',
  subtitle: '系统会话',
  avatarColor: '#4f46e5',
}

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [threads, setThreads] = useState([])
  const [messagesByThread, setMessagesByThread] = useState({})
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const messagesEndRef = useRef(null)

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

  const ensureThread = useCallback((threadId, meta = {}) => {
    setThreads((prev) => {
      const existed = prev.find((t) => t.id === threadId)
      if (existed) {
        return prev.map((t) => (t.id === threadId ? { ...t, ...meta } : t))
      }
      const nextThread = { ...DEFAULT_THREAD, ...meta, id: threadId, unread: 0 }
      return [nextThread, ...prev]
    })
  }, [])

  useEffect(() => {
    ensureThread(DEFAULT_THREAD.id, DEFAULT_THREAD)
  }, [ensureThread])

  const addMessage = useCallback(
    ({ text, type = 'self', timestamp = new Date(), threadId = DEFAULT_THREAD.id, meta = {} }) => {
      const ts = timestamp instanceof Date ? timestamp : new Date(timestamp)
      const msg = {
        id: createId(),
        text,
        type,
        timestamp: ts,
        timestampLabel: type === SYSTEM_MESSAGE ? '' : formatTime(ts),
      }

      setMessagesByThread((prev) => {
        const list = prev[threadId] || []
        return { ...prev, [threadId]: [...list, msg] }
      })

      setThreads((prev) => {
        const existed = prev.find((t) => t.id === threadId)
        const unreadIncrement = type === SYSTEM_MESSAGE || type === 'self' || activeThreadId === threadId ? 0 : 1
        const base = existed || { ...DEFAULT_THREAD, id: threadId }
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
    window.addChatMessage = (text, type = 'self', timestamp, threadId = DEFAULT_THREAD.id, meta = {}) => {
      addMessage({ text, type, timestamp, threadId, meta })
    }
    window.addSystemMessage = (text, threadId = DEFAULT_THREAD.id) => {
      addMessage({ text, type: SYSTEM_MESSAGE, threadId })
    }
    window.registerChatThread = (threadId, meta = {}) => {
      ensureThread(threadId, meta)
    }
    return () => {
      delete window.addChatMessage
      delete window.addSystemMessage
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
    const threadId = activeThreadId || threads[0]?.id || DEFAULT_THREAD.id
    const text = (drafts[threadId] || '').trim()
    if (!text) return
    addMessage({ text, type: 'self', threadId })
    setDrafts((prev) => ({ ...prev, [threadId]: '' }))
  }

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
        <div className="chat-launcher" id="globalChatLauncher" onClick={handleToggleDrawer} role="button" tabIndex={0}>
          <div className="chat-launcher-left">
            <div className="chat-launcher-icon">💬</div>
            <div className="chat-launcher-text">
              <div className="chat-launcher-title">Chats</div>
              <div className="chat-launcher-sub">快速打开对话</div>
            </div>
          </div>
          <div className={`chat-caret ${drawerOpen ? 'open' : ''}`}>⌄</div>
        </div>
      )}

      {drawerOpen && (
        <div className="chat-drawer" id="globalChatDrawer">
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
          <div className="chat-drawer-section-label">Messaging</div>
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
        </div>
      )}

      {activeThreadId && (
        <div className="chat-thread-window" id="globalChatThreadWindow">
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

