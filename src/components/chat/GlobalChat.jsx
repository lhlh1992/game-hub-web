import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'globalChatCollapsed'
const SYSTEM_MESSAGE = 'system'

const seedMessages = [
  { id: 1, text: '欢迎来到 GameHub！', type: SYSTEM_MESSAGE },
  { id: 2, text: 'Player1: Good luck!', type: 'opponent' },
  { id: 3, text: 'Player2: Thanks, have fun!', type: 'self' },
]

const GlobalChat = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [messages, setMessages] = useState(seedMessages)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'true') {
        setCollapsed(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const persistCollapsed = useCallback((next) => {
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        setCollapsed(event.newValue === 'true')
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const addMessage = useCallback(
    (text, type = 'self', timestamp = new Date()) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`
      setMessages((prev) => [
        ...prev,
        {
          id,
          text,
          type,
          timestamp,
        },
      ])
      if (collapsed) {
        persistCollapsed(false)
      }
    },
    [collapsed, persistCollapsed],
  )

  useEffect(() => {
    window.addChatMessage = (text, type, timestamp) => {
      addMessage(text, type, timestamp ? new Date(timestamp) : new Date())
    }
    window.addSystemMessage = (text) => {
      addMessage(text, SYSTEM_MESSAGE)
    }
    return () => {
      delete window.addChatMessage
      delete window.addSystemMessage
    }
  }, [addMessage])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleToggle = () => {
    persistCollapsed(!collapsed)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) {
      return
    }
    addMessage(text, 'self')
    setInput('')
  }

  const formattedMessages = useMemo(
    () =>
      messages.map((msg) => ({
        ...msg,
        timestampLabel:
          msg.type === SYSTEM_MESSAGE
            ? ''
            : (msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
      })),
    [messages],
  )

  return (
    <div className={`chat-widget ${collapsed ? 'collapsed' : ''}`} id="globalChatWidget">
      <div className="chat-header" id="globalChatHeader">
        <span className="chat-title">Chat</span>
        <button className="chat-toggle" id="globalChatToggle" type="button" onClick={handleToggle}>
          {collapsed ? '+' : '−'}
        </button>
      </div>
      {!collapsed && (
        <div className="chat-body" id="globalChatBody">
          <div className="chat-messages" id="globalChatMessages">
            {formattedMessages.map((msg) => (
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
              placeholder="Type a message..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSend()
                }
              }}
            />
            <button id="globalChatSend" className="chat-send" type="button" onClick={handleSend}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GlobalChat

