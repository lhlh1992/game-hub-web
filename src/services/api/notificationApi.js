import { get, post } from './apiClient.js'

export async function fetchNotifications(status = 'UNREAD', limit = 20) {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (limit) query.set('limit', limit)
  return get(`/system-service/api/notifications?${query.toString()}`)
}

export async function fetchUnreadCount() {
  return get('/system-service/api/notifications/unread-count')
}

export async function markNotificationRead(id) {
  return post(`/system-service/api/notifications/${id}/read`)
}

export async function markAllNotificationsRead() {
  return post('/system-service/api/notifications/read-all')
}


