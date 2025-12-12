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
      onNotify: (notify) => {
        // 全局通知 -> 喂给全局聊天组件
        try {
          console.log('[GH][notify] received payload', notify)
          const threadId = 'notify'
          const title = notify?.title || notify?.type || '通知'
          const content = notify?.content || '收到一条新通知'
          const subtitle = notify?.payload?.requesterName || notify?.fromUserId || ''
          if (typeof window.registerChatThread === 'function') {
            window.registerChatThread(threadId, {
              id: threadId,
              title,
              subtitle: subtitle || '系统通知',
              avatarColor: '#f59e0b',
            })
          }
          if (typeof window.addSystemMessage === 'function') {
            const payloadText = notify?.payload?.requestMessage || ''
            const actionsText = Array.isArray(notify?.actions) && notify.actions.length > 0
              ? ` [${notify.actions.join('/')}]`
              : ''
            const text = payloadText ? `${content}：${payloadText}${actionsText}` : `${content}${actionsText}`
            window.addSystemMessage(text, threadId)
          }
        } catch {
          // ignore render issues
        }

        // 广播浏览器事件，供 Header 通知铃铛使用
        try {
          const event = new CustomEvent('gh-notify', { detail: notify })
          window.dispatchEvent(event)
        } catch {
          // ignore
        }
      },
    }
    
    connectChatWebSocket(callbacks)
    
    return () => {
      // 移除回调监听器（不断开连接，因为可能有其他监听器在使用）
      removeChatWebSocketCallbacks(callbacks)
    }
  }, [isAuthenticated])
}

