import { authenticatedJsonFetch } from './apiClient.js'

/**
 * 获取房间聊天历史
 * @param {string} roomId 房间ID
 * @param {number} limit 最大条数（默认 50）
 * @returns {Promise<Array>} 消息列表
 */
export async function getRoomChatHistory(roomId, limit = 50) {
  if (!roomId) return []
  const qs = new URLSearchParams()
  if (limit) qs.append('limit', String(limit))
  const url = `/chat-service/api/rooms/${roomId}/history${qs.toString() ? `?${qs.toString()}` : ''}`
  try {
    const data = await authenticatedJsonFetch(url, { method: 'GET' })
    return Array.isArray(data) ? data : []
  } catch (error) {
    // 获取历史失败，静默处理
    return []
  }
}



