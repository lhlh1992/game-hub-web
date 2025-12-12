import { post } from './apiClient.js'

/**
 * 申请加好友
 * @param {string} targetUserId 目标用户ID（Keycloak用户ID）
 * @param {string} [requestMessage] 申请留言（可选）
 * @returns {Promise<{autoAccepted: boolean, message: string}>} 申请结果
 */
export async function applyFriend(targetUserId, requestMessage) {
  if (!targetUserId) {
    throw new Error('目标用户ID不能为空')
  }
  
  try {
    // 始终包含 requestMessage 字段，即使为空字符串（后端会处理空字符串）
    const requestData = { 
      targetUserId,
      requestMessage: requestMessage || null
    }
    
    const response = await post('/system-service/api/friends/apply', requestData)
    
    // 检查响应格式
    if (response.code !== 200) {
      throw new Error(response.message || '申请加好友失败')
    }
    
    // 根据返回的 message 判断是否自动通过
    const message = response.message || ''
    const autoAccepted = message.includes('已自动成为好友') || message.includes('自动成为好友')
    
    return {
      autoAccepted,
      message: response.message || '申请已发送'
    }
  } catch (error) {
    throw new Error(`申请加好友失败: ${error.message}`)
  }
}

/**
 * 同意好友申请
 * @param {string} requestId 好友申请ID
 */
export async function acceptFriendRequest(requestId) {
  if (!requestId) throw new Error('请求ID不能为空')
  return postFriendActionWithFallback(requestId, 'accept', '同意好友申请失败')
}

/**
 * 拒绝好友申请
 * @param {string} requestId 好友申请ID
 */
export async function rejectFriendRequest(requestId) {
  if (!requestId) throw new Error('请求ID不能为空')
  return postFriendActionWithFallback(requestId, 'reject', '拒绝好友申请失败')
}

// 内部：多路径回退，兼容网关/直连/不同前缀（避免 404）
async function postFriendActionWithFallback(requestId, action, defaultMsg) {
  const paths = [
    `/system-service/api/friends/requests/${requestId}/${action}`,
    `/api/friends/requests/${requestId}/${action}`,
  ]
  let lastErr
  for (const p of paths) {
    try {
      const resp = await post(p)
      if (resp.code !== 200) {
        throw new Error(resp.message || defaultMsg)
      }
      return resp
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error(defaultMsg)
}



