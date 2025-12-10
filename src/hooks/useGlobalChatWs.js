import { useEffect } from 'react'
import { connectChatWebSocket, disconnectChatWebSocket } from '../services/ws/chatSocket.js'
import { useAuth } from './useAuth.js'

/**
 * 全局聊天 WS：用户登录后建立，登出/卸载时断开。
 * 房间/大厅等订阅在各自页面完成。
 * 支持自动重连（心跳断开后自动恢复）。
 */
export function useGlobalChatWs() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectChatWebSocket()
      return undefined
    }
    connectChatWebSocket({
      onConnect: () => {
        // 连接成功
      },
      onDisconnect: () => {
        // 连接断开
      },
      onError: (err) => {
        // 连接失败
      },
      onReconnecting: (attempt, delay) => {
        // 正在重连
      },
      onReconnectFailed: () => {
        // 重连失败
      },
    })
    return () => {
      disconnectChatWebSocket()
    }
  }, [isAuthenticated])
}

