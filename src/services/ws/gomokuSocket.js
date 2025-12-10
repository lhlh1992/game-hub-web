import SockJS from 'sockjs-client'
import { Stomp } from '@stomp/stompjs'
import { ensureAuthenticated, performSessionLogout } from '../auth/authService.js'

let socket = null
let stomp = null
const subscriptions = new Map()
const isDevEnv = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

// 自动重连配置
let reconnectTimer = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10 // 最大重连次数
const INITIAL_RECONNECT_DELAY = 1000 // 初始重连延迟（毫秒）
const MAX_RECONNECT_DELAY = 30000 // 最大重连延迟（毫秒）
let currentCallbacks = null
let isManualDisconnect = false // 是否手动断开（手动断开不自动重连）
let heartbeatCheckInterval = null // 心跳检测定时器（全局变量，用于清理）

function logWs(...args) {
  // 控制台输出已禁用
}

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
 * 计算重连延迟（指数退避）
 */
function getReconnectDelay(attempt) {
  const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY)
  return delay
}

/**
 * 尝试自动重连
 * @param {boolean} isInitialConnect - 是否是初始连接（初始连接不显示重连提示）
 */
function scheduleReconnect(isInitialConnect = false) {
  if (isManualDisconnect) {
    logWs('手动断开，不自动重连')
    return
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logWs('达到最大重连次数，停止重连')
    currentCallbacks?.onReconnectFailed?.()
    return
  }

  const delay = getReconnectDelay(reconnectAttempts)
  reconnectAttempts++
  logWs(`将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连`)

  // 只有在真正重连时才显示提示（不是初始连接）
  if (!isInitialConnect) {
    currentCallbacks?.onReconnecting?.(reconnectAttempts, delay)
  }

  reconnectTimer = setTimeout(() => {
    if (!isManualDisconnect) {
      logWs(`开始第 ${reconnectAttempts} 次重连`)
      connectWebSocketInternal(currentCallbacks)
    }
  }, delay)
}

/**
 * 内部连接方法（支持重连）
 * @param {Object} callbacks - 回调函数
 * @param {boolean} isInitialConnect - 是否是初始连接
 */
async function connectWebSocketInternal(callbacks = {}, isInitialConnect = false) {
  if (typeof window === 'undefined') {
    return
  }

  if (stomp && stomp.connected) {
    reconnectAttempts = 0
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    callbacks.onConnect?.()
    return
  }

  // 如果已有连接尝试，先断开
  if (socket) {
    try {
      socket.close()
      logWs('关闭已有 SockJS 连接')
    } catch (e) {
      // ignore
    }
  }

  const token = await ensureAuthenticated()
  if (!token) {
    scheduleReconnect(isInitialConnect)
    return
  }

  // 通过 URL 参数传递 token（SockJS 握手请求无法在请求头中传递自定义 header）
  const wsUrl = `/game-service/ws?access_token=${encodeURIComponent(token)}`
  logWs('开始建立连接', { url: '/game-service/ws', hasToken: Boolean(token) })
  socket = new SockJS(wsUrl)
  socket.onclose = (event) => {
    logWs('连接关闭', { code: event?.code, reason: event?.reason })
    // 通知连接断开
    callbacks.onDisconnect?.()
    
    // 如果不是手动断开，尝试自动重连（此时不是初始连接）
    if (!isManualDisconnect) {
      scheduleReconnect(false)
    }
  }
  socket.onerror = (error) => {
    logWs('SockJS 错误', error)
    // SockJS 错误通常意味着连接问题，立即触发断开检测
    if (!isManualDisconnect && socket.readyState === SockJS.CLOSED) {
      callbacks.onDisconnect?.()
      scheduleReconnect(false) // 此时不是初始连接
    }
  }
  stomp = Stomp.over(socket)

  // 设置调试模式（可选，生产环境可关闭）
  stomp.debug = function (str) {
    // 心跳相关日志：每 10 秒会看到心跳消息
    if (str && (str.includes('heartbeat') || str.includes('PING') || str.includes('PONG'))) {
      logWs('[心跳]', str)
    }
    // STOMP debug disabled (其他消息不输出)
  }

  // 配置心跳：客户端每 5 秒发送一次心跳，期望服务端每 5 秒发送一次心跳
  stomp.heartbeat.outgoing = 5000
  stomp.heartbeat.incoming = 5000
  
  // 监听 STOMP 错误
  const originalOnStompError = stomp.onStompError
  stomp.onStompError = (frame) => {
    logWs('STOMP 错误', frame)
    if (!isManualDisconnect) {
      callbacks.onError?.(new Error(frame.headers?.message || 'STOMP 错误'))
      scheduleReconnect(false) // 此时不是初始连接
    }
    if (originalOnStompError) {
      originalOnStompError.call(stomp, frame)
    }
  }
  
  // 定期检查连接状态（仅在连接成功后启用）
  // 清理旧的定时器
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval)
    heartbeatCheckInterval = null
  }
  
  // 注意：这个检查只在连接成功后启用，避免在连接建立过程中误判

  const headers = { Authorization: 'Bearer ' + token }

  // 设置连接超时（10秒）
  const connectTimeout = setTimeout(() => {
    if (!stomp.connected) {
      logWs('连接超时')
      callbacks.onError?.(new Error('连接超时'))
      if (!isManualDisconnect) {
        scheduleReconnect(isInitialConnect) // 初始连接超时也不显示重连提示
      }
    }
  }, 10000)

  try {
    stomp.connect(headers, (frame) => {
      clearTimeout(connectTimeout)
      reconnectAttempts = 0
      clearTimeout(reconnectTimer)
      reconnectTimer = null
      logWs('连接成功', { sessionId: frame?.headers['session'] })
      
      // 连接成功后，启动定期检查（仅在连接成功时启用，避免误判）
      if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval)
      }
      heartbeatCheckInterval = setInterval(() => {
        if (isManualDisconnect) {
          clearInterval(heartbeatCheckInterval)
          heartbeatCheckInterval = null
          return
        }
        
        // 只有在连接成功后才会检查，如果 STOMP 显示未连接，说明真的断开了
        if (stomp && !stomp.connected) {
          logWs('检测到连接断开（定期检查）')
          clearInterval(heartbeatCheckInterval)
          heartbeatCheckInterval = null
          callbacks.onDisconnect?.()
          scheduleReconnect(false) // 定期检查发现的断开，不是初始连接
        }
      }, 5000) // 每 5 秒检查一次（降低频率，避免误判）
      
      callbacks.onConnect?.()
    }, (error) => {
      clearTimeout(connectTimeout)
      // 如果是 401 / 未授权，直接自动登出，不重连
      if (isUnauthorizedWebSocketError(error)) {
        logWs('连接被拒绝，未授权', error)
        isManualDisconnect = true
        performSessionLogout('WebSocket 会话已失效，请重新登录')
        return
      }
      logStompError(error)
      logWs('连接错误', error)
      callbacks.onError?.(error)
      if (!isManualDisconnect) {
        scheduleReconnect(isInitialConnect) // 初始连接错误也不显示重连提示
      }
    })
  } catch (error) {
    clearTimeout(connectTimeout)
    logWs('连接异常', error)
      callbacks.onError?.(error)
      if (!isManualDisconnect) {
        scheduleReconnect(isInitialConnect) // 初始连接异常也不显示重连提示
      }
  }
}

/**
 * 连接 WebSocket
 * 自动从 Keycloak 获取 token 并注入到连接中
 * @param {Object} callbacks - 回调函数
 *   - onConnect: 连接成功
 *   - onDisconnect: 连接断开
 *   - onError: 连接错误
 *   - onReconnecting: 正在重连 (attempt, delay)
 *   - onReconnectFailed: 重连失败（达到最大次数）
 */
export async function connectWebSocket(callbacks = {}) {
  currentCallbacks = callbacks
  isManualDisconnect = false
  reconnectAttempts = 0
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  
  // 标记这是初始连接，不是重连
  const wasConnected = stomp?.connected || false
  await connectWebSocketInternal(callbacks, !wasConnected)
}

function logStompError(error) {
  // 控制台输出已禁用
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
      // 解析失败，静默处理
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
      // 解析失败，静默处理
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
      // 解析失败，静默处理
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

export function sendReady(roomId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.ready',
    body: JSON.stringify({ roomId, seatKey }),
  })
}

export function sendStartGame(roomId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.start',
    body: JSON.stringify({ roomId, seatKey }),
  })
}

export function sendKick(roomId, targetUserId, seatKey = null) {
  const client = getClient()
  client.publish({
    destination: '/app/gomoku.kick',
    body: JSON.stringify({ roomId, targetUserId, seatKey }),
  })
}

export function subscribeKicked(onKicked) {
  const client = getClient()
  const topic = '/user/queue/gomoku.kicked'

  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }

  const sub = client.subscribe(topic, (frame) => {
    try {
      const event = JSON.parse(frame.body)
      onKicked(event)
    } catch (error) {
      // 解析失败，静默处理
    }
  })

  subscriptions.set(topic, sub)
  return () => sub.unsubscribe()
}

export function disconnectWebSocket() {
  isManualDisconnect = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectAttempts = 0
  currentCallbacks = null
  
  // 清理心跳检测定时器
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval)
    heartbeatCheckInterval = null
  }

  subscriptions.forEach((sub) => sub.unsubscribe())
  subscriptions.clear()

  if (stomp) {
    logWs('手动断开 STOMP 连接')
    stomp.disconnect()
    stomp = null
  }
  
  if (socket) {
    logWs('手动关闭 SockJS')
    socket.close()
    socket = null
  }
}

export function isConnected() {
  return Boolean(stomp?.connected)
}

