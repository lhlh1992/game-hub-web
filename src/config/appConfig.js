const env = import.meta.env || {}

/**
 * 是否启用模拟认证（默认 true，设置 VITE_USE_MOCK_AUTH=false 可启用真实认证流程）
 */
export const USE_MOCK_AUTH = env.VITE_USE_MOCK_AUTH !== 'false'

export const API_BASE_URL = env.VITE_API_BASE_URL || ''
export const WS_BASE_URL = env.VITE_WS_BASE_URL || ''


