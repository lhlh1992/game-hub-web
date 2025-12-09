import { useEffect, useRef, useState } from 'react'
import { connectChatWebSocket, disconnectChatWebSocket, sendRoomChat, subscribeRoomChat } from '../services/ws/chatSocket.js'

/**
 * 维护独立的房间聊天 WS 连接（与游戏 WS 并行）。
 * - 自动建立/清理
 * - 订阅房间消息并回调 onMessage
 * - 暴露 send 方法
 */
export function useChatRoomWs({ roomId, onMessage }) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!roomId) return undefined
    let cancelled = false
    setError(null)
    connectChatWebSocket({
      onConnect: () => {
        if (cancelled) return
        setConnected(true)
        unsubRef.current = subscribeRoomChat(roomId, (evt) => onMessage?.(evt))
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
    })
    return () => {
      cancelled = true
      unsubRef.current?.()
      unsubRef.current = null
      disconnectChatWebSocket()
    }
  }, [roomId, onMessage])

  const send = (content) => {
    if (!roomId) return
    return sendRoomChat(roomId, content)
  }

  return { connected, error, send }
}

