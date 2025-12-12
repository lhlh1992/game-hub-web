import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useOngoingGame } from '../../hooks/useOngoingGame.js'
import { leaveRoom } from '../../services/api/gameApi.js'

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
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.status === 'UNREAD').length,
    [notifications],
  )

  // 监听来自 WS 的通知事件（useGlobalChatWs 通过 window.dispatchEvent('gh-notify', detail) 发出）
  useEffect(() => {
    // 先消费可能存在的缓冲
    try {
      const buf = Array.isArray(window.__ghNotifyBuffer) ? window.__ghNotifyBuffer : []
      if (buf.length > 0) {
        buf.forEach((notify) => {
          setNotifications((prev) => {
            const id = notify.timestamp || Date.now()
            const next = [
              {
                id,
                title: notify.title || '系统通知',
                content: notify.content || notify.payload?.requestMessage || '',
                status: 'UNREAD',
                createdAt: notify.timestamp || Date.now(),
              },
              ...prev,
            ].slice(0, 30)
            return next
          })
        })
        window.__ghNotifyBuffer = []
      }
    } catch {
      // ignore
    }

    const handler = (event) => {
      const notify = event?.detail || {}
      console.log('[GH][bell] received notify', notify)
      setNotifications((prev) => {
        const id = notify.timestamp || Date.now()
        const next = [
          {
            id,
            title: notify.title || '系统通知',
            content: notify.content || notify.payload?.requestMessage || '',
            status: 'UNREAD',
            createdAt: notify.timestamp || Date.now(),
          },
          ...prev,
        ].slice(0, 30)
        return next
      })
      setNotifyOpen(true)
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
    // 打开时，假定用户已查看列表，全部标记为已读
    if (!notifyOpen && unreadCount > 0) {
      setNotifications((list) => list.map((n) => ({ ...n, status: 'READ' })))
    }
  }

  const handleNotifyClick = (id) => {
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, status: 'READ' } : n)),
    )
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
                      notifications.slice(0, 10).map((item) => (
                        <div
                          key={item.id}
                          className={`notify-item ${item.status === 'UNREAD' ? 'unread' : ''}`}
                          onClick={() => handleNotifyClick(item.id)}
                        >
                          <div className="notify-title">{item.title || '系统通知'}</div>
                          <div className="notify-content">{item.content || ''}</div>
                          <div className="notify-time">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString()
                              : ''}
                          </div>
                        </div>
                      ))
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
          <button type="button" className="profile-drawer__action">
            消息中心
          </button>
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

export default Header

