import { ensureAuthenticated, handleAuthExpiredResponse } from '../auth/authService.js'

export async function authenticatedFetch(url, options = {}) {
  const token = await ensureAuthenticated()
  if (!token) {
    throw new Error('未登录')
  }

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    handleAuthExpiredResponse(response, `${options.method || 'GET'} ${url} 返回 401`)
    throw new Error('认证失败')
  }

  return response
}

/**
 * 带 token 的 JSON 请求
 * @param {string} url - 请求 URL
 * @param {RequestInit} options - fetch 选项
 * @returns {Promise<any>}
 */
export async function authenticatedJsonFetch(url, options = {}) {
  const response = await authenticatedFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  return response.json()
}

/**
 * GET 请求
 */
export async function get(url, options = {}) {
  return authenticatedJsonFetch(url, { ...options, method: 'GET' })
}

/**
 * POST 请求
 */
export async function post(url, data, options = {}) {
  return authenticatedJsonFetch(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * PUT 请求
 */
export async function put(url, data, options = {}) {
  return authenticatedJsonFetch(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * DELETE 请求
 */
export async function del(url, options = {}) {
  return authenticatedJsonFetch(url, { ...options, method: 'DELETE' })
}

