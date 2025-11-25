import SockJS from 'sockjs-client'
import { Stomp } from '@stomp/stompjs'
import { ensureAuthenticated, performSessionLogout } from '../auth/authService.js'

let socket = null
let stomp = null
const subscriptions = new Map()

function isUnauthorizedWebSocketError(error) {
  if (!error) {
    return false
  }

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
    throw new Error('WebSocket 尚未连接')
  }
  return stomp
}

/**
 * 连接 WebSocket
 * 自动从 Keycloak 获取 token 并注入到连接中
 * @param {Object} callbacks - 回调函数
 */
export async function connectWebSocket(callbacks = {}) {
  if (typeof window === 'undefined') {
    return
  }

  if (stomp && stomp.connected) {
    callbacks.onConnect?.()
    return
  }

  // 如果已有连接尝试，先断开
  if (socket) {
    try {
      socket.close()
    } catch (e) {
      // ignore
    }
  }

  const token = await ensureAuthenticated()
  if (!token) {
    throw new Error('未登录')
  }

  // 通过 URL 参数传递 token（SockJS 握手请求无法在请求头中传递自定义 header）
  const wsUrl = `/game-service/ws?access_token=${encodeURIComponent(token)}`
  socket = new SockJS(wsUrl)
  socket.onclose = (event) => {
    if (event && event.code !== 1000) {
      console.error('WebSocket 非正常断开', event.code, event.reason || '')
    }
  }
  stomp = Stomp.over(socket)

  // 设置调试模式（可选，生产环境可关闭）
  stomp.debug = function (str) {
    // STOMP debug disabled
  }

  const headers = { Authorization: 'Bearer ' + token }

  // 设置连接超时（10秒）
  const connectTimeout = setTimeout(() => {
    if (!stomp.connected) {
      callbacks.onError?.(new Error('连接超时'))
    }
  }, 10000)

  try {
    stomp.connect(headers, (frame) => {
      clearTimeout(connectTimeout)
      callbacks.onConnect?.()
    }, (error) => {
      clearTimeout(connectTimeout)
      // 如果是 401 / 未授权，直接自动登出
      if (isUnauthorizedWebSocketError(error)) {
        performSessionLogout('WebSocket 会话已失效，请重新登录')
        return
      }
      logStompError(error)
      callbacks.onError?.(error)
    })
  } catch (error) {
    clearTimeout(connectTimeout)
    console.error('WebSocket 连接异常', error)
    callbacks.onError?.(error)
  }
}

function logStompError(error) {
  if (!error) {
    return
  }
  const headers = error.headers || {}
  const message = headers.message || headers.Message || error.message
  if (message || error.body) {
    console.error('WebSocket 错误', message || '', error.body || '')
  } else {
    console.error('WebSocket 错误', error)
  }
}

export function subscribeRoom(roomId, onEvent) {
  const client = getClient()
  const topic = `/topic/room.${roomId}`

  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }

  const sub = client.subscribe(topic, (frame) => {
    try {
      const evt = JSON.parse(frame.body)
      onEvent(evt)
    } catch (error) {
      console.error('解析房间事件失败', error)
    }
  })

  subscriptions.set(topic, sub)
}

export function subscribeSeatKey(onSeatKey) {
  const client = getClient()
  const topic = '/user/queue/gomoku.seat'

  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }

  const sub = client.subscribe(topic, (frame) => {
    try {
      const payload = JSON.parse(frame.body)
      const seatKey = typeof payload === 'string' ? payload : payload.seatKey
      const side = payload.side || 'X'
      onSeatKey(seatKey, side)
    } catch (error) {
      console.error('解析 seatKey 失败', error)
    }
  })

  subscriptions.set(topic, sub)
}

export function subscribeFullSync(onFullSync) {
  const client = getClient()
  const topic = '/user/queue/gomoku.full'

  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }

  const sub = client.subscribe(topic, (frame) => {
    try {
      const snap = JSON.parse(frame.body)
      onFullSync(snap)
    } catch (error) {
      console.error('解析完整同步失败', error)
    }
  })

  subscriptions.set(topic, sub)
}

export function sendResume(roomId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.resume',
    body: JSON.stringify({ roomId, seatKey }),
  })
}

export function sendPlace(roomId, x, y, side, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.place',
    body: JSON.stringify({ roomId, x, y, side, seatKey }),
  })
}

export function sendResign(roomId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.resign',
    body: JSON.stringify({ roomId, seatKey }),
  })
}

export function sendRestart(roomId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.restart',
    body: JSON.stringify({ roomId, seatKey }),
  })
}

export function disconnectWebSocket() {
  subscriptions.forEach((sub) => sub.unsubscribe())
  subscriptions.clear()

  if (stomp) {
    stomp.disconnect()
    stomp = null
  }
  
  if (socket) {
    socket.close()
    socket = null
  }
}

export function isConnected() {
  return Boolean(stomp?.connected)
}

