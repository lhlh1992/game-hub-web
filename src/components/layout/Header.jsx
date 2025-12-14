import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useOngoingGame } from '../../hooks/useOngoingGame.js'
import { leaveRoom } from '../../services/api/gameApi.js'
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead } from '../../services/api/notificationApi.js'
import { acceptFriendRequest, rejectFriendRequest } from '../../services/api/friendApi.js'

const DEFAULT_AVATAR = '/images/avatar-default.png'
const BELL_ICON = '/images/bell.svg'

// 为头像 URL 添加一次性 cache-bust，避免浏览器缓存旧头像
const withCacheBust = (url, version) => {
  if (!url) return url
  const v = version || Date.now()
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_=${v}`
}

const Header = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadTotal, setUnreadTotal] = useState(0) // 后端未读总数（不限前端截断）
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' })
  const { data: ongoingGame, refresh: refreshOngoing } = useOngoingGame()
  const ongoing = ongoingGame?.hasOngoing ? ongoingGame : null

  const displayName = useMemo(() => user?.nickname?.trim() || user?.username || '玩家', [user])

  const avatarUrl = useMemo(() => {
    const avatarVersion = user?.updatedAt || user?.avatarUpdatedAt || user?.lastModifiedAt || Date.now()
    const raw = user?.avatarUrl?.trim()
    return withCacheBust(raw, avatarVersion) || DEFAULT_AVATAR
  }, [user])

  useEffect(() => {
    document.body.classList.toggle('profile-drawer-open', drawerOpen)
    return () => {
      document.body.classList.remove('profile-drawer-open')
    }
  }, [drawerOpen])

  // 未读计数
  const unreadCount = useMemo(() => {
    // 若有后端未读总数，用总数；否则用前端列表计算
    return unreadTotal > 0 ? unreadTotal : notifications.filter((n) => n.status === 'UNREAD').length
  }, [notifications, unreadTotal])

  // 初始拉取通知列表（未读），保证刷新后仍能看到
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [listResp, countResp] = await Promise.all([
          // 拉全部最新 10 条（含已读未读），但角标用后端未读数
          fetchNotifications(null, 10),
          fetchUnreadCount(),
        ])
        if (cancelled) return
        const list = Array.isArray(listResp?.data) ? listResp.data : []
        setNotifications(list.map((n) => ({
          id: n.id || n.notificationId || n.createdAt || Date.now(),
          title: n.title || '系统通知',
          content: n.content || '',
          status: n.status || 'UNREAD',
          createdAt: n.createdAt,
          type: n.type || 'SYSTEM',
          actions: Array.isArray(n.actions) ? n.actions : [],
          payload: n.payload || {},
        })))
        if (typeof countResp?.data === 'number') {
          setUnreadTotal(countResp.data)
        } else {
          setUnreadTotal(list.length)
        }
      } catch (e) {
        console.warn('拉取通知失败', e?.message || e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // 将通知追加到铃铛列表（带去重）
  const appendNotification = (notify) => {
    let added = false
    setNotifications((prev) => {
      // 优先使用 notificationId（唯一标识），这是后端生成的唯一ID
      const notificationId = notify.id || notify.notificationId || notify.payload?.notificationId
      const friendRequestId = notify.payload?.friendRequestId
      
      // 生成通知的唯一ID：优先使用 notificationId，如果没有则使用其他字段组合
      // 注意：每次新申请都会生成新的 notificationId，所以不会和旧通知冲突
      const id = notificationId || (notify.type === 'FRIEND_REQUEST' && friendRequestId ? `friend-request-${friendRequestId}` : null) || `notify-${notify.timestamp || Date.now()}`
      
      // 检查是否已存在相同的通知
      // 对于好友申请，优先检查 notificationId（因为每次新申请都会生成新的 notificationId）
      const isFriendRequest = notify.type === 'FRIEND_REQUEST'
      let exists = false
      
      if (isFriendRequest && notificationId) {
        // 好友申请通知：检查是否有相同的 notificationId
        exists = prev.some((n) => {
          if (n.type !== 'FRIEND_REQUEST') return false
          // 检查 notificationId 是否相同
          const nNotificationId = n.id === notificationId || n.payload?.notificationId === notificationId
          return nNotificationId
        })
      } else {
        // 非好友申请通知，或没有 notificationId 的好友申请，使用标准去重逻辑
        exists = prev.some((n) => n.id === id)
      }
      
      if (exists) {
        console.warn('[Header] 通知已存在，跳过添加', { 
          id, 
          notificationId, 
          friendRequestId, 
          type: notify.type,
          existingNotifications: prev.filter(n => n.type === 'FRIEND_REQUEST').map(n => ({
            id: n.id,
            notificationId: n.payload?.notificationId,
            friendRequestId: n.payload?.friendRequestId,
            hasActions: n.actions?.length > 0
          }))
        })
        return prev
      }
      
      added = true
      const newNotification = {
        id,
        title: notify.title || '系统通知',
        content: notify.content || notify.payload?.requestMessage || '',
        status: notify.status || 'UNREAD',
        createdAt: notify.createdAt || notify.timestamp || Date.now(),
        type: notify.type || 'SYSTEM',
        actions: Array.isArray(notify.actions) ? notify.actions : [],
        payload: notify.payload || {},
      }
      
      console.log('[Header] ✅ 添加新通知成功', { 
        id, 
        notificationId, 
        friendRequestId, 
        type: notify.type, 
        hasActions: newNotification.actions.length > 0,
        notification: newNotification
      })
      
      // 添加新通知到列表顶部
      const next = sortNotifications([newNotification, ...prev]).slice(0, 10)
      return next
    })
    // 未读总数 +1（仅未读，且确实新增）
    if (added && (!notify.status || notify.status === 'UNREAD')) {
      setUnreadTotal((n) => n + 1)
    }
  }

  // 监听来自 WS 的通知事件（useGlobalChatWs 广播 gh-notify）
  useEffect(() => {
    // 先消费可能存在的缓冲
    try {
      const buf = Array.isArray(window.__ghNotifyBuffer) ? window.__ghNotifyBuffer : []
      if (buf.length > 0) {
        buf.forEach(appendNotification)
        window.__ghNotifyBuffer = []
      }
    } catch {
      // ignore
    }

    const handler = (event) => {
      const notify = event?.detail || {}
      console.log('[GH][bell] received notify event', {
        type: notify.type,
        notificationId: notify.id || notify.notificationId || notify.payload?.notificationId,
        friendRequestId: notify.payload?.friendRequestId,
        hasActions: Array.isArray(notify.actions) && notify.actions.length > 0,
        notify
      })
      appendNotification(notify)
      // 如果是好友申请通知，自动打开通知面板
      if (notify.type === 'FRIEND_REQUEST') {
        setNotifyOpen(true)
      }
    }
    window.addEventListener('gh-notify', handler)
    return () => window.removeEventListener('gh-notify', handler)
  }, [])

  const handleLogout = () => {
    if (!window.confirm('确定退出登录吗？')) {
      return
    }
    logout()
  }

  const handleContinueGame = () => {
    if (!ongoing?.roomId) return
    navigate(`/game/${ongoing.roomId}`)
  }

  const handleLogin = () => {
    login()
  }

  const showToast = (text, type = 'info', duration = 2200) => {
    setToast({ show: true, text, type })
    window.clearTimeout(showToast._tid)
    showToast._tid = window.setTimeout(() => {
      setToast((t) => ({ ...t, show: false }))
    }, duration)
  }

  const handleQuitGame = async () => {
    if (!ongoing?.roomId || ending) return
    const confirmed = window.confirm('确认离开当前对局并返回大厅？')
    if (!confirmed) return
    setEnding(true)
    try {
      await leaveRoom(ongoing.roomId)
      await refreshOngoing?.()
      navigate('/lobby')
    } catch (error) {
      // 结束对局失败，静默处理
      window.alert('结束对局失败，请稍后再试')
    } finally {
      setEnding(false)
    }
  }

  const toggleNotify = () => {
    setNotifyOpen((open) => !open)
  }

  const handleNotifyClick = (id) => {
    setNotifications((list) => {
      let wasUnread = false
      const next = sortNotifications(list.map((n) => {
        if (n.id === id) {
          wasUnread = n.status === 'UNREAD'
          return { ...n, status: 'READ' }
        }
        return n
      }))
      if (wasUnread) {
        setUnreadTotal((c) => Math.max(0, c - 1))
        markNotificationRead(id).catch(() => {})
      }
      return next
    })
  }

  // 处理好友申请操作（同意/拒绝）
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
        // 因为同意方不会收到FRIEND_RESULT通知，需要主动刷新
        try {
          const refreshEvent = new CustomEvent('gh-friend-list-refresh', { 
            detail: { action: 'ACCEPT', requestId } 
          })
          window.dispatchEvent(refreshEvent)
        } catch (err) {
          console.warn('[Header] 触发好友列表刷新事件失败', err)
        }
      } else if (action === 'REJECT') {
        await rejectFriendRequest(requestId)
        showToast('已拒绝好友申请', 'warning')
      }
      // 成功后标记已读、移除动作，并保存处理状态
      setNotifications((list) => {
        let wasUnread = false
        const handledStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'
        const handledStatusText = action === 'ACCEPT' ? '已同意' : '已拒绝'
        const next = sortNotifications(list.map((n) => {
          if (n.id === item.id) {
            wasUnread = n.status === 'UNREAD'
            const updatedPayload = { ...(n.payload || {}), handledStatus, handledStatusText }
            return { ...n, status: 'READ', actions: [], payload: updatedPayload }
          }
          return n
        }))
        if (wasUnread) {
          setUnreadTotal((c) => Math.max(0, c - 1))
          markNotificationRead(item.id).catch(() => {})
        }
        return next
      })
    } catch (err) {
      showToast(err?.message || '操作失败，请稍后再试', 'error', 2600)
    }
  }

  const playerId = useMemo(() => user?.playerId || user?.displayId || user?.username || '--', [user])

  return (
    <div data-component="global-header">
      <header className="gh-header">
        <div className="gh-header-inner">
          <Link to="/" className="logo" aria-label="返回首页">
            <div className="logo-square" />
            <span>GameHub</span>
          </Link>

          <div className="header-tools">
            {ongoing ? (
              <div className="ongoing-pill">
                <button className="pill-main" type="button" onClick={handleContinueGame}>
                  <span className="pill-label">继续对局</span>
                  <span className="pill-title">{ongoing.title || '返回游戏'}</span>
                </button>
                <button
                  className="pill-exit"
                  type="button"
                  onClick={handleQuitGame}
                  disabled={ending}
                  aria-label="结束当前对局"
                >
                  退出
                </button>
              </div>
            ) : null}
            <div className="bell-wrapper">
              <button className="bell" type="button" aria-label="通知" onClick={toggleNotify}>
                <img src={BELL_ICON} alt="通知" />
                {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
              </button>
              {notifyOpen && (
                <div className="notify-dropdown">
                  <div className="notify-header">
                    <span>通知中心</span>
                    {unreadCount > 0 && <span className="notify-unread">未读 {unreadCount}</span>}
                  </div>
                  <div className="notify-list">
                    {notifications.length === 0 ? (
                      <div className="notify-empty">暂无通知</div>
                    ) : (
                      <>
                        {notifications.slice(0, 4).map((item) => {
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
                        {notifications.length > 4 && (
                          <div className="notify-more">
                            <Link
                              to="/messages"
                              className="notify-more-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                setNotifyOpen(false)
                              }}
                            >
                              更多
                            </Link>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="avatar-pill is-compact" style={{ opacity: 0.5 }}>
                <div className="avatar" style={{ backgroundImage: `url('${DEFAULT_AVATAR}')` }} />
              </div>
            ) : isAuthenticated ? (
              <div
                className="avatar-pill is-compact"
                data-role="avatar-trigger"
                onClick={() => setDrawerOpen(true)}
              >
                <div className="avatar" data-role="avatar" style={{ backgroundImage: `url('${avatarUrl}')` }} />
              </div>
            ) : (
              <button className="gh-btn gh-btn--primary" type="button" onClick={handleLogin}>
                登录
              </button>
            )}
          </div>
        </div>
        <Toast info={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
      </header>

      <ProfileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        displayName={displayName}
        playerId={playerId}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
      />
    </div>
  )
}

const ProfileDrawer = ({ open, onClose, displayName, playerId, avatarUrl, onLogout }) => {
  return (
    <div className={`profile-drawer ${open ? 'is-visible' : ''}`} data-profile-drawer="">
      <div className="profile-drawer__overlay" onClick={onClose} />
      <aside className="profile-drawer__panel">
        <button className="profile-drawer__close" type="button" onClick={onClose} aria-label="关闭侧边栏">
          ×
        </button>
        <div className="profile-drawer__hero">
          <div className="profile-drawer__avatar" style={{ backgroundImage: `url('${avatarUrl}')` }} />
          <div className="profile-drawer__name">{displayName}</div>
          <div className="profile-drawer__id">玩家ID：{playerId}</div>
        </div>
        <div className="profile-drawer__actions">
          <button type="button" className="profile-drawer__action">
            隐私模式
          </button>
          <Link to="/messages" className="profile-drawer__action" onClick={onClose}>
            消息中心
          </Link>
          <Link to="/profile" className="profile-drawer__action" onClick={onClose}>
            个人中心
          </Link>
          <button type="button" className="profile-drawer__action" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </aside>
    </div>
  )
}

const Toast = ({ info, onClose }) => {
  if (!info?.show) return null
  const type = info.type || 'info'
  return (
    <div className="gh-toast" onClick={onClose}>
      <div className={`gh-toast-content ${type}`}>
        <span className="gh-toast-dot" />
        <span className="gh-toast-text">{info.text}</span>
      </div>
    </div>
  )
}

// 未读优先，其次时间倒序
function sortNotifications(list) {
  return [...list].sort((a, b) => {
    const aUnread = a.status === 'UNREAD'
    const bUnread = b.status === 'UNREAD'
    if (aUnread !== bUnread) return aUnread ? -1 : 1
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bTime - aTime
  })
}

export default Header

