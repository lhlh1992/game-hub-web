import { useEffect } from 'react'
import { connectChatWebSocket, disconnectChatWebSocket } from '../services/ws/chatSocket.js'
import { useAuth } from './useAuth.js'

/**
 * 全局聊天 WS：用户登录后建立，登出/卸载时断开。
 * 房间/大厅等订阅在各自页面完成。
 */
export function useGlobalChatWs() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectChatWebSocket()
      return undefined
    }
    connectChatWebSocket({
      onError: (err) => {
        console.error('Chat WebSocket 全局连接失败', err)
      },
    })
    return () => {
      disconnectChatWebSocket()
    }
  }, [isAuthenticated])
}

