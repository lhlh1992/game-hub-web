import { post, put, get, authenticatedFetch } from './apiClient.js'

/**
 * 上传头像到临时目录
 * @param {File} file 图片文件
 * @returns {Promise<string>} 临时文件URL
 */
export async function uploadAvatarToTemp(file) {
  const formData = new FormData()
  formData.append('file', file)
  
  try {
    const response = await authenticatedFetch('/system-service/api/files/upload/avatar/temp', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      // 尝试解析后端错误
      try {
        const error = await response.json()
        throw new Error(error.message || '上传失败')
      } catch (e) {
        const text = await response.text()
        throw new Error(text || '上传失败')
      }
    }
    
    const result = await response.json()
    if (result.code !== 200) {
      throw new Error(result.message || '上传失败')
    }
    
    return result.data
  } catch (error) {
    throw new Error(`上传头像失败: ${error.message}`)
  }
}

/**
 * 获取当前用户完整信息
 * @returns {Promise<Object>} 用户信息
 */
export async function getCurrentUserProfile() {
  try {
    const response = await get('/system-service/api/users/me/profile')
    return response.data || response
  } catch (error) {
    throw new Error(`获取用户信息失败: ${error.message}`)
  }
}

/**
 * 更新用户资料
 * @param {Object} profileData 用户资料数据
 * @param {string} [profileData.nickname] 昵称
 * @param {string} [profileData.email] 邮箱
 * @param {string} [profileData.phone] 手机号
 * @param {string} [profileData.avatarUrl] 头像URL（临时URL）
 * @param {string} [profileData.bio] 个人简介
 * @param {string} [profileData.locale] 语言偏好
 * @param {string} [profileData.timezone] 时区
 * @param {Object} [profileData.settings] 用户设置
 * @returns {Promise<Object>} 更新后的用户信息
 */
export async function updateUserProfile(profileData) {
  try {
    const requestData = {
      nickname: profileData.nickname,
      email: profileData.email,
      phone: profileData.phone,
      avatarUrl: profileData.avatarUrl,
      bio: profileData.bio,
      locale: profileData.locale,
      timezone: profileData.timezone,
      settings: profileData.settings ? JSON.stringify(profileData.settings) : undefined
    }
    
    // 移除 undefined 字段
    Object.keys(requestData).forEach(key => {
      if (requestData[key] === undefined) {
        delete requestData[key]
      }
    })
    
    const response = await put('/system-service/api/users/me/profile', requestData)
    return response.data || response
  } catch (error) {
    throw new Error(`更新用户资料失败: ${error.message}`)
  }
}

