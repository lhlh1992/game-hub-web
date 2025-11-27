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



