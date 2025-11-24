import {
  getTokenFromGateway,
  handleAuthExpiredResponse,
  handleFetchFailure,
} from '../auth/authService.js'

/**
 * 创建房间
 * @param {Object} options
 * @param {string} [options.mode='PVE']
 * @param {string} [options.aiPiece='O']
 * @param {string} [options.rule='STANDARD']
 * @param {string} [options.token]
 * @returns {Promise<string>} 房间 ID
 */
export async function createRoom({ mode = 'PVE', aiPiece = 'O', rule = 'STANDARD', token } = {}) {
  const url = `/game-service/api/gomoku/new?mode=${mode}&aiPiece=${aiPiece}&rule=${rule}`
  let freshToken = await getTokenFromGateway()
  if (!freshToken) {
    freshToken = token
  }

  const doFetch = async (tok) => {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
      },
    })
  }

  let res
  try {
    res = await doFetch(freshToken)
  } catch (error) {
    handleFetchFailure(error, '创建房间请求异常')
    throw error
  }

  if (res.status === 401) {
    handleAuthExpiredResponse(res, '创建房间接口返回 401')
    throw new Error('创建房间失败：会话已失效')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`创建房间失败 (HTTP ${res.status}): ${text}`)
  }

  return await res.text()
}

export async function getMe(token) {
  let res
  try {
    res = await fetch('/game-service/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  } catch (error) {
    handleFetchFailure(error, 'GET /game-service/me 请求异常 (getMe)')
    throw error
  }

  if (res.status === 401) {
    handleAuthExpiredResponse(res, 'GET /game-service/me 返回 401 (getMe)')
    throw new Error('获取用户信息失败：会话已失效')
  }

  if (!res.ok) {
    throw new Error(`获取用户信息失败 (HTTP ${res.status})`)
  }

  return await res.json()
}


