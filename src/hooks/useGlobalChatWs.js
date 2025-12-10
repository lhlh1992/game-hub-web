import { useEffect, useRef } from 'react'
import { connectChatWebSocket, disconnectChatWebSocket, removeChatWebSocketCallbacks } from '../services/ws/chatSocket.js'
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
    
    // 创建回调对象
    const callbacks = {
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
    }
    
    connectChatWebSocket(callbacks)
    
    return () => {
      // 移除回调监听器（不断开连接，因为可能有其他监听器在使用）
      removeChatWebSocketCallbacks(callbacks)
    }
  }, [isAuthenticated])
}

