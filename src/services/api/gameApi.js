import { post, get as apiGet } from './apiClient.js'

/**
 * 统一处理 API 响应
 * @param {Promise} apiCall - API 调用 Promise
 * @returns {Promise} 返回 data 字段，如果 code !== 200 则抛出错误
 */
async function handleApiResponse(apiCall) {
  const response = await apiCall
  
  // 检查响应格式
  if (response.code !== 200) {
    throw new Error(response.message || '请求失败')
  }
  
  // 返回数据
  return response.data
}

/**
 * 创建房间
 * @param {Object} options
 * @param {string} [options.mode='PVE']
 * @param {string} [options.aiPiece='O']
 * @param {string} [options.rule='STANDARD']
 * @returns {Promise<string>} 房间 ID
 */
export async function createRoom({ mode = 'PVE', aiPiece = 'O', rule = 'STANDARD' } = {}) {
  const url = `/game-service/api/gomoku/new?mode=${mode}&aiPiece=${aiPiece}&rule=${rule}`
  
  try {
    // 后端返回统一格式：{ code: 200, message: "success", data: "房间ID" }
    return await handleApiResponse(post(url, {}))
  } catch (error) {
    throw new Error(`创建房间失败: ${error.message}`)
  }
}

/**
 * 获取当前用户信息
 * @returns {Promise<Object>} 用户信息
 */
export async function getMe() {
  try {
    // 后端返回统一格式：{ code: 200, message: "success", data: {用户信息} }
    return await handleApiResponse(apiGet('/game-service/me'))
  } catch (error) {
    throw new Error(`获取用户信息失败: ${error.message}`)
  }
}

/**
 * 获取当前正在进行中的游戏
 * @returns {Promise<{hasOngoing: boolean, gameType?: string, roomId?: string, title?: string}>}
 */
export async function getOngoingGame() {
  try {
    return await handleApiResponse(apiGet('/game-service/api/ongoing-game'))
  } catch (error) {
    throw new Error(`获取进行中对局失败: ${error.message}`)
  }
}

/**
 * 结束当前进行中的游戏
 * @param {string} [roomId]
 */
export async function endOngoingGame(roomId) {
  try {
    return await handleApiResponse(post('/game-service/api/ongoing-game/end', { roomId }))
  } catch (error) {
    throw new Error(`结束进行中对局失败: ${error.message}`)
  }
}

/**
 * 加入房间：玩家加入其他玩家创建的房间
 * @param {string} roomId 房间ID
 * @returns {Promise<{side: 'X' | 'O'}>} 分配的座位
 */
export async function joinRoom(roomId) {
  try {
    return await handleApiResponse(post(`/game-service/api/gomoku/rooms/${roomId}/join`, {}))
  } catch (error) {
    throw new Error(`加入房间失败: ${error.message}`)
  }
}

/**
 * 主动离开房间
 * @param {string} roomId
 */
export async function leaveRoom(roomId) {
  try {
    return await handleApiResponse(post(`/game-service/api/gomoku/rooms/${roomId}/leave`, {}))
  } catch (error) {
    throw new Error(`退出房间失败: ${error.message}`)
  }
}

/**
 * 获取在线房间列表（大厅用）
 * @param {{cursor?: number | null, limit?: number}} params
 * @returns {Promise<{items: Array, nextCursor: number | null, hasMore: boolean}>}
 */
export async function listGomokuRooms({ cursor = null, limit = 4 } = {}) {
  const qs = new URLSearchParams()
  if (cursor) qs.append('cursor', String(cursor))
  if (limit) qs.append('limit', String(limit))
  const url = `/game-service/api/gomoku/rooms${qs.toString() ? `?${qs.toString()}` : ''}`

  try {
    return await handleApiResponse(apiGet(url))
  } catch (error) {
    throw new Error(`获取房间列表失败: ${error.message}`)
  }
}



