import { useEffect, useRef, useState } from 'react'
import { connectChatWebSocket, removeChatWebSocketCallbacks, sendRoomChat, subscribeRoomChat } from '../services/ws/chatSocket.js'

/**
 * 维护独立的房间聊天 WS 连接（与游戏 WS 并行）。
 * - 自动建立/清理
 * - 订阅房间消息并回调 onMessage
 * - 暴露 send 方法
 */
export function useChatRoomWs({ roomId, onMessage }) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!roomId) return undefined
    let cancelled = false
    setError(null)
    setReconnecting(false)
    
    // 创建回调对象
    const callbacks = {
      onConnect: () => {
        if (cancelled) return
        setConnected(true)
        setReconnecting(false)
        unsubRef.current = subscribeRoomChat(roomId, (evt) => {
          onMessage?.(evt)
        })
      },
      onDisconnect: () => {
        if (cancelled) return
        setConnected(false)
      },
      onError: (err) => {
        if (cancelled) return
        setError(err)
        setConnected(false)
      },
      onReconnecting: (attempt, delay) => {
        if (cancelled) return
        setReconnecting(true)
        setConnected(false)
      },
      onReconnectFailed: () => {
        if (cancelled) return
        setReconnecting(false)
        setError(new Error('重连失败，请刷新页面'))
      },
    }
    
    connectChatWebSocket(callbacks)
    
    return () => {
      cancelled = true
      unsubRef.current?.()
      unsubRef.current = null
      // 移除回调监听器（不主动断开全局聊天 WS，只取消房间订阅）
      removeChatWebSocketCallbacks(callbacks)
    }
  }, [roomId, onMessage])

  const send = (content) => {
    if (!roomId) return
    return sendRoomChat(roomId, content)
  }

  return { connected, reconnecting, error, send }
}

