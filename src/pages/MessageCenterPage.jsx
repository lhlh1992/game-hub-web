import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api/notificationApi.js'
import { acceptFriendRequest, rejectFriendRequest } from '../services/api/friendApi.js'
import '../styles/header.css'

const PAGE_SIZE = 10

// 检查是否是有效的 UUID 格式
const isValidUUID = (str) => {
  if (!str || typeof str !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

const MessageCenterPage = () => {
  const { isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' })

  const showToast = useCallback((text, type = 'info', duration = 2200) => {
    setToast({ show: true, text, type })
    window.clearTimeout(showToast._tid)
    showToast._tid = window.setTimeout(() => {
      setToast((t) => ({ ...t, show: false }))
    }, duration)
  }, [])

  // 加载通知列表
  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return
    
    setLoading(true)
    try {
      // 后端API目前只支持limit，我们请求足够多的数据（100条）然后在前端分页
      // 这样可以支持最多10页的分页显示
      const limit = 100
      const response = await fetchNotifications(null, limit)
      const list = Array.isArray(response?.data) ? response.data : []
      
      const formattedList = list.map((n) => ({
        id: n.id || n.notificationId || n.createdAt || Date.now(),
        title: n.title || '系统通知',
        content: n.content || '',
        status: n.status || 'UNREAD',
        createdAt: n.createdAt,
        type: n.type || 'SYSTEM',
        actions: Array.isArray(n.actions) ? n.actions : [],
        payload: n.payload || {},
      }))

      setNotifications(formattedList)
    } catch (error) {
      console.error('加载通知失败', error)
      showToast('加载通知失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, showToast])

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications()
    }
  }, [isAuthenticated, loadNotifications])

  // 监听WebSocket通知事件，实时更新
  useEffect(() => {
    if (!isAuthenticated) return

    const handler = (event) => {
      const notify = event?.detail || {}
      const notificationId = notify.id || notify.notificationId || notify.payload?.notificationId
      
      setNotifications((prev) => {
        // 检查是否已存在
        const exists = prev.some((n) => n.id === notificationId || n.payload?.notificationId === notificationId)
        if (exists) return prev

        const newNotification = {
          id: notificationId || Date.now(),
          title: notify.title || '系统通知',
          content: notify.content || notify.payload?.requestMessage || '',
          status: notify.status || 'UNREAD',
          createdAt: notify.createdAt || notify.timestamp || Date.now(),
          type: notify.type || 'SYSTEM',
          actions: Array.isArray(notify.actions) ? notify.actions : [],
          payload: notify.payload || {},
        }

        return [newNotification, ...prev]
      })
    }

    window.addEventListener('gh-notify', handler)
    return () => window.removeEventListener('gh-notify', handler)
  }, [isAuthenticated])

  // 处理通知点击（标记已读）
  const handleNotifyClick = async (id) => {
    setNotifications((list) => {
      return list.map((n) => {
        if (n.id === id && n.status === 'UNREAD') {
          // 只在 id 是有效 UUID 时才调用后端 API
          // WebSocket 推送的临时通知可能没有 UUID，只在前端标记为已读即可
          if (isValidUUID(id)) {
            markNotificationRead(id).catch(() => {})
          }
          return { ...n, status: 'READ' }
        }
        return n
      })
    })
  }

  // 处理好友申请操作
  const handleFriendRequestAction = async (item, action, e) => {
    e?.stopPropagation?.()
    const requestId = item?.payload?.friendRequestId || item?.refId || item?.id
    if (!requestId) {
      showToast('缺少好友申请ID，无法处理', 'error')
      return
    }
    try {
      if (action === 'ACCEPT') {
        await acceptFriendRequest(requestId)
        showToast('已同意好友申请', 'success')
        
        // 同意好友申请后，触发好友列表刷新事件
        try {
          const refreshEvent = new CustomEvent('gh-friend-list-refresh', { 
            detail: { action: 'ACCEPT', requestId } 
          })
          window.dispatchEvent(refreshEvent)
        } catch (err) {
          console.warn('[MessageCenter] 触发好友列表刷新事件失败', err)
        }
      } else if (action === 'REJECT') {
        await rejectFriendRequest(requestId)
        showToast('已拒绝好友申请', 'warning')
      }
      
      // 更新通知状态
      setNotifications((list) => {
        const handledStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'
        const handledStatusText = action === 'ACCEPT' ? '已同意' : '已拒绝'
        return list.map((n) => {
          if (n.id === item.id) {
            const updatedPayload = { ...(n.payload || {}), handledStatus, handledStatusText }
            return { ...n, status: 'READ', actions: [], payload: updatedPayload }
          }
          return n
        })
      })
    } catch (err) {
      showToast(err?.message || '操作失败，请稍后再试', 'error', 2600)
    }
  }

  // 标记全部已读
  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((list) => list.map((n) => ({ ...n, status: 'READ' })))
      showToast('已标记全部为已读', 'success')
    } catch (error) {
      showToast('标记全部已读失败', 'error')
    }
  }

  // 计算分页数据
  const totalPages = Math.ceil(notifications.length / PAGE_SIZE)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const currentNotifications = notifications.slice(startIndex, endIndex)
  const unreadCount = notifications.filter((n) => n.status === 'UNREAD').length

  // 排序通知（未读优先，然后按时间倒序）
  const sortedNotifications = [...notifications].sort((a, b) => {
    const aUnread = a.status === 'UNREAD'
    const bUnread = b.status === 'UNREAD'
    if (aUnread !== bUnread) return aUnread ? -1 : 1
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bTime - aTime
  })

  const paginatedNotifications = sortedNotifications.slice(startIndex, endIndex)

  if (!isAuthenticated) {
    return (
      <section className="page page--centered">
        <h1>请先登录</h1>
        <p>您需要登录后才能查看消息中心。</p>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-header">
        <h1>消息中心</h1>
        <div className="page-header-actions">
          {unreadCount > 0 && (
            <button
              type="button"
              className="gh-btn gh-btn--ghost"
              onClick={handleMarkAllRead}
            >
              全部标记已读
            </button>
          )}
        </div>
      </div>

      <div className="message-center-container">
        {loading && notifications.length === 0 ? (
          <div className="message-center-loading">加载中...</div>
        ) : paginatedNotifications.length === 0 ? (
          <div className="message-center-empty">暂无通知</div>
        ) : (
          <>
            <div className="message-center-list">
              {paginatedNotifications.map((item) => {
                const actions = Array.isArray(item.actions) ? item.actions : []
                const isFriendRequest = item.type === 'FRIEND_REQUEST'
                const handledStatusText = item?.payload?.handledStatusText
                const isHandled = isFriendRequest && (actions.length === 0) && handledStatusText

                return (
                  <div
                    key={item.id}
                    className={`notify-item ${item.status === 'UNREAD' ? 'unread' : ''}`}
                    onClick={() => handleNotifyClick(item.id)}
                  >
                    <div className="notify-title">{item.title || '系统通知'}</div>
                    <div className="notify-content">
                      {item.content || ''}
                      {isHandled && (
                        <span className="notify-status" style={{ 
                          color: item?.payload?.handledStatus === 'ACCEPTED' ? '#52c41a' : '#ff4d4f',
                          fontWeight: 500,
                          fontSize: '11px',
                          marginLeft: '6px'
                        }}>
                          {handledStatusText}
                        </span>
                      )}
                      {isFriendRequest && item?.payload?.requestMessage && (
                        <div className="notify-request-message" style={{
                          marginTop: '6px',
                          padding: '6px 8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.03)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#666',
                          lineHeight: '1.4',
                          borderLeft: '2px solid #1890ff',
                          maxWidth: '100%',
                          boxSizing: 'border-box'
                        }}>
                          <span style={{ color: '#999', fontSize: '11px' }}>验证信息：</span>
                          <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {item.payload.requestMessage}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="notify-time">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : ''}
                    </div>
                    {isFriendRequest && actions.length > 0 && (
                      <div className="notify-actions">
                        {actions.includes('ACCEPT') && (
                          <button
                            type="button"
                            className="notify-btn accept"
                            onClick={(e) => handleFriendRequestAction(item, 'ACCEPT', e)}
                          >
                            同意
                          </button>
                        )}
                        {actions.includes('REJECT') && (
                          <button
                            type="button"
                            className="notify-btn reject"
                            onClick={(e) => handleFriendRequestAction(item, 'REJECT', e)}
                          >
                            拒绝
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="message-center-pagination">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (currentPage > 1) {
                      setCurrentPage((p) => p - 1)
                    }
                  }}
                >
                  上一页
                </button>
                <span className="pagination-info">
                  第 {currentPage} / {totalPages} 页（共 {notifications.length} 条）
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage >= totalPages}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (currentPage < totalPages) {
                      setCurrentPage((p) => p + 1)
                    }
                  }}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast提示 */}
      {toast.show && (
        <div className="gh-toast" onClick={() => setToast((t) => ({ ...t, show: false }))}>
          <div className={`gh-toast-content ${toast.type}`}>
            <span className="gh-toast-dot" />
            <span className="gh-toast-text">{toast.text}</span>
          </div>
        </div>
      )}
    </section>
  )
}

export default MessageCenterPage

