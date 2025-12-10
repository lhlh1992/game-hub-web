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
const MAX_RECONNECT_ATTEMPTS = 10
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
// 使用回调列表管理多个监听器（支持 useGlobalChatWs 和 useChatRoomWs 同时监听）
const callbackListeners = new Set()
let isManualDisconnect = false
let heartbeatCheckInterval = null // 心跳检测定时器（全局变量，用于清理）

/**
 * 通知所有监听器
 */
function notifyListeners(method, ...args) {
  callbackListeners.forEach((callbacks) => {
    if (callbacks && typeof callbacks[method] === 'function') {
      try {
        callbacks[method](...args)
      } catch (error) {
        // 监听器回调出错，不影响其他监听器
      }
    }
  })
}

function logWs(...args) {
  // 控制台输出已禁用
}

function logStompError(error) {
  // 控制台输出已禁用
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

/**
 * 计算重连延迟（指数退避）
 */
function getReconnectDelay(attempt) {
  return Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY)
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
    notifyListeners('onReconnectFailed')
    return
  }

  const delay = getReconnectDelay(reconnectAttempts)
  reconnectAttempts++
  logWs(`将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连`)

  // 只有在真正重连时才显示提示（不是初始连接）
  if (!isInitialConnect) {
    notifyListeners('onReconnecting', reconnectAttempts, delay)
  }

  reconnectTimer = setTimeout(() => {
    if (!isManualDisconnect) {
      logWs(`开始第 ${reconnectAttempts} 次重连`)
      connectChatWebSocketInternal()
    }
  }, delay)
}

/**
 * 内部连接方法（支持重连）
 * @param {boolean} isInitialConnect - 是否是初始连接
 */
async function connectChatWebSocketInternal(isInitialConnect = false) {
  if (typeof window === 'undefined') return
  if (stomp && stomp.connected) {
    reconnectAttempts = 0
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    notifyListeners('onConnect')
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
  if (!token) {
    scheduleReconnect(isInitialConnect)
    return
  }

  const wsUrl = `/chat-service/ws?access_token=${encodeURIComponent(token)}`
  logWs('建立连接', { url: '/chat-service/ws' })
  socket = new SockJS(wsUrl)
  socket.onclose = (event) => {
    notifyListeners('onDisconnect')
    if (!isManualDisconnect) {
      scheduleReconnect(false) // 此时不是初始连接
    }
  }
  socket.onerror = (error) => {
    logWs('SockJS 错误', error)
    // SockJS 错误通常意味着连接问题，立即触发断开检测
    if (!isManualDisconnect && socket.readyState === SockJS.CLOSED) {
      notifyListeners('onDisconnect')
      scheduleReconnect(false) // 此时不是初始连接
    }
  }

  stomp = Stomp.over(socket)
  stomp.debug = (str) => {
    // 心跳相关日志：每 10 秒会看到心跳消息
    if (str && (str.includes('heartbeat') || str.includes('PING') || str.includes('PONG'))) {
      logWs('[心跳]', str)
    }
  }

  // 配置心跳：客户端每 5 秒发送一次心跳，期望服务端每 5 秒发送一次心跳
  stomp.heartbeat.outgoing = 5000
  stomp.heartbeat.incoming = 5000
  
  // 定期检查连接状态（仅在连接成功后启用）
  // 清理旧的定时器
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval)
    heartbeatCheckInterval = null
  }
  
  // 注意：这个检查只在连接成功后启用，避免在连接建立过程中误判

  const headers = { Authorization: 'Bearer ' + token }
  const connectTimeout = setTimeout(() => {
    if (!stomp.connected) {
      notifyListeners('onError', new Error('连接超时'))
      if (!isManualDisconnect) {
        scheduleReconnect(isInitialConnect) // 初始连接超时也不显示重连提示
      }
    }
  }, 10000)

  try {
    stomp.connect(
      headers,
      (frame) => {
        clearTimeout(connectTimeout)
        reconnectAttempts = 0
        clearTimeout(reconnectTimer)
        reconnectTimer = null
        logWs('连接成功', { sessionId: frame?.headers?.session })
        
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
            notifyListeners('onDisconnect')
            scheduleReconnect(false) // 定期检查发现的断开，不是初始连接
          }
        }, 5000) // 每 5 秒检查一次（降低频率，避免误判）
        
        // 订阅系统踢线通知：收到后标记为手动断开，停止重连
        try {
          subscribeSystemKick((payload) => {
            const reason = payload?.reason || '账号已在其他终端登录'
            isManualDisconnect = true
            notifyListeners('onKicked', reason)
            disconnectChatWebSocket()
          })
        } catch {
          // ignore
        }

        notifyListeners('onConnect')
      },
      (error) => {
        clearTimeout(connectTimeout)
        if (isUnauthorized(error)) {
          isManualDisconnect = true
          performSessionLogout('聊天会话已失效，请重新登录')
          return
        }
        logStompError(error)
        notifyListeners('onError', error)
        if (!isManualDisconnect) {
          scheduleReconnect(isInitialConnect) // 初始连接错误也不显示重连提示
        }
      },
    )
  } catch (error) {
    clearTimeout(connectTimeout)
    logStompError(error)
    notifyListeners('onError', error)
    if (!isManualDisconnect) {
      scheduleReconnect(isInitialConnect) // 初始连接异常也不显示重连提示
    }
  }
}

/**
 * 连接聊天 WebSocket
 * @param {Object} callbacks - 回调函数
 *   - onConnect: 连接成功
 *   - onDisconnect: 连接断开
 *   - onError: 连接错误
 *   - onReconnecting: 正在重连 (attempt, delay)
 *   - onReconnectFailed: 重连失败（达到最大次数）
 *   - onKicked: 收到系统踢线通知（单点登录/登出），参数：reason
 */
export async function connectChatWebSocket(callbacks = {}) {
  // 添加回调监听器（支持多个监听器）
  if (callbacks && Object.keys(callbacks).length > 0) {
    callbackListeners.add(callbacks)
  }
  
  // 如果已经连接，直接通知新添加的监听器，不重置重连状态
  if (stomp && stomp.connected) {
    // 通知新添加的监听器连接已建立
    if (callbacks && typeof callbacks.onConnect === 'function') {
      try {
        callbacks.onConnect()
      } catch (error) {
        // 忽略错误
      }
    }
    return
  }
  
  // 如果正在重连（reconnectTimer 存在），只添加监听器，不干扰重连过程
  // 重连成功后会通过 notifyListeners 通知所有监听器（包括新添加的）
  if (reconnectTimer) {
    return
  }
  
  // 只有在没有连接且没有正在重连时，才初始化连接
  isManualDisconnect = false
  reconnectAttempts = 0
  // 标记这是初始连接，不是重连
  await connectChatWebSocketInternal(true)
}

/**
 * 移除回调监听器
 */
export function removeChatWebSocketCallbacks(callbacks) {
  if (callbacks) {
    callbackListeners.delete(callbacks)
  }
}

export function subscribeRoomChat(roomId, onEvent) {
  logWs('订阅房间', roomId)
  let client
  try {
    client = getClient()
  } catch (e) {
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
      // 解析失败，静默处理
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

/**
 * 订阅系统踢线通知（单点登录/登出等）
 */
function subscribeSystemKick(onKick) {
  const client = getClient()
  const topic = '/user/queue/system.kick'

  if (subscriptions.has(topic)) {
    try {
      subscriptions.get(topic).unsubscribe()
    } catch {
      // ignore
    }
  }

  const sub = client.subscribe(topic, (frame) => {
    try {
      const payload = JSON.parse(frame.body)
      onKick?.(payload)
    } catch {
      // ignore
    }
  })

  subscriptions.set(topic, sub)
}

export function sendRoomChat(roomId, content, clientOpId) {
  let client
  try {
    client = getClient()
  } catch (e) {
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
  isManualDisconnect = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectAttempts = 0
  callbackListeners.clear() // 清空所有回调监听器
  
  // 清理心跳检测定时器
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval)
    heartbeatCheckInterval = null
  }

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

