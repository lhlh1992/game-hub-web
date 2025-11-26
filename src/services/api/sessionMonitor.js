/**
 * 会话监控 API 服务
 */

// 直接请求 system-service，绕过网关认证
const SESSIONS_API_URL = 'http://localhost:8082/internal/sessions'

/**
 * 获取所有在线用户的会话信息
 * @returns {Promise<Array>} 用户会话快照列表
 */
export async function getAllSessions() {
  try {
    const response = await fetch(SESSIONS_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`获取会话信息失败: HTTP ${response.status}`)
    }

    const data = await response.json()
    return data || []
  } catch (error) {
    console.error('获取会话信息失败', error)
    throw error
  }
}

