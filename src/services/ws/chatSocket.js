import SockJS from 'sockjs-client'
import { Stomp } from '@stomp/stompjs'
import { ensureAuthenticated, performSessionLogout } from '../auth/authService.js'

let socket = null
let stomp = null

const subscriptions = new Map()
const isDevEnv = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

function logWs(...args) {
  // 生产默认静默；如需调试可改为 console.log
  if (typeof window !== 'undefined' && window.__CHAT_WS_DEBUG__) {
    console.log('[CHAT-WS]', ...args)
  }
}

function logStompError(error) {
  if (!error) return
  const headers = error.headers || {}
  const message = headers.message || headers.Message || error.message
  if (message || error.body) {
    console.error('[CHAT-WS] 错误', message || '', error.body || '')
  } else {
    console.error('[CHAT-WS] 错误', error)
  }
}

function isUnauthorized(error) {
  if (!error) return false
  const headers = error.headers || {}
  const headerMessage = String(headers.message || headers.Message || '').toLowerCase()
  const body = String(error.body || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return (
    headerMessage.includes('401') ||
    headerMessage.includes('unauthorized') ||
    body.includes('401') ||
    body.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('unauthorized')
  )
}

function getClient() {
  if (!stomp || !stomp.connected) {
    throw new Error('Chat WebSocket 未连接')
  }
  return stomp
}

export async function connectChatWebSocket(callbacks = {}) {
  if (typeof window === 'undefined') return
  if (stomp && stomp.connected) {
    callbacks.onConnect?.()
    return
  }
  // 关闭旧连接
  if (socket) {
    try {
      socket.close()
    } catch (e) {
      // ignore
    }
  }

  const token = await ensureAuthenticated()
  if (!token) throw new Error('未登录')

  const wsUrl = `/chat-service/ws?access_token=${encodeURIComponent(token)}`
  logWs('建立连接', { url: '/chat-service/ws' })
  socket = new SockJS(wsUrl)
  socket.onclose = (event) => {
    if (event && event.code !== 1000) {
      console.error('[CHAT-WS] 非正常断开', event.code, event.reason || '')
    }
    callbacks.onDisconnect?.()
  }

  stomp = Stomp.over(socket)
  stomp.debug = () => {}

  const headers = { Authorization: 'Bearer ' + token }
  const connectTimeout = setTimeout(() => {
    if (!stomp.connected) {
      callbacks.onError?.(new Error('连接超时'))
    }
  }, 10000)

  try {
    stomp.connect(
      headers,
      (frame) => {
        clearTimeout(connectTimeout)
        logWs('连接成功', { sessionId: frame?.headers?.session })
        callbacks.onConnect?.()
      },
      (error) => {
        clearTimeout(connectTimeout)
        if (isUnauthorized(error)) {
          performSessionLogout('聊天会话已失效，请重新登录')
          return
        }
        logStompError(error)
        callbacks.onError?.(error)
      },
    )
  } catch (error) {
    clearTimeout(connectTimeout)
    logStompError(error)
    callbacks.onError?.(error)
  }
}

export function subscribeRoomChat(roomId, onEvent) {
  logWs('订阅房间', roomId)
  let client
  try {
    client = getClient()
  } catch (e) {
    console.error('[CHAT-WS] 订阅失败，连接未建立', e)
    throw e
  }
  const topic = `/topic/chat.room.${roomId}`
  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }
  const sub = client.subscribe(topic, (frame) => {
    try {
      const evt = JSON.parse(frame.body)
      onEvent(evt)
    } catch (err) {
      console.error('[CHAT-WS] 解析消息失败', err)
    }
  })
  subscriptions.set(topic, sub)
  return () => {
    try {
      sub.unsubscribe()
    } catch (e) {
      // ignore
    }
  }
}

export function sendRoomChat(roomId, content, clientOpId) {
  let client
  try {
    client = getClient()
  } catch (e) {
    console.error('[CHAT-WS] 发送失败，连接未建立', e)
    throw e
  }
  logWs('发送房间消息', { roomId, content })
  client.publish({
    destination: '/app/chat.room.send',
    body: JSON.stringify({
      roomId,
      content,
      clientOpId: clientOpId || crypto?.randomUUID?.() || String(Date.now()),
    }),
  })
}

export function disconnectChatWebSocket() {
  subscriptions.forEach((sub) => {
    try {
      sub.unsubscribe()
    } catch {
      // ignore
    }
  })
  subscriptions.clear()
  try {
    stomp?.disconnect?.(() => logWs('主动断开'))
  } catch {
    // ignore
  }
  try {
    socket?.close?.()
  } catch {
    // ignore
  }
  stomp = null
  socket = null
}

