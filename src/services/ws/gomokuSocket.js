import SockJS from 'sockjs-client'
import { Client } from '@stomp/stompjs'
import { performSessionLogout } from '../auth/authService.js'

let stompClient = null
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
  if (!stompClient || !stompClient.connected) {
    throw new Error('WebSocket 尚未连接')
  }
  return stompClient
}

export function connectWebSocket(token, callbacks = {}) {
  if (typeof window === 'undefined') {
    return
  }

  if (stompClient?.connected) {
    callbacks.onConnect?.()
    return
  }

  const wsUrl = token
    ? `/game-service/ws?access_token=${encodeURIComponent(token)}`
    : '/game-service/ws'

  stompClient = new Client({
    webSocketFactory: () => new SockJS(wsUrl),
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    debug: () => {},
    reconnectDelay: 0,
  })

  stompClient.onConnect = () => {
    callbacks.onConnect?.()
  }

  stompClient.onStompError = (frame) => {
    if (isUnauthorizedWebSocketError(frame)) {
      performSessionLogout('WebSocket 连接返回 401/未授权')
      return
    }
    callbacks.onError?.(frame)
  }

  stompClient.onWebSocketError = (event) => {
    callbacks.onError?.(event)
  }

  stompClient.activate()
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

  if (stompClient) {
    stompClient.deactivate()
    stompClient = null
  }
}

export function isConnected() {
  return Boolean(stompClient?.connected)
}

