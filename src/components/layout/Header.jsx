import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useOngoingGame } from '../../hooks/useOngoingGame.js'

const DEFAULT_AVATAR = '/images/avatar-default.png'
const BELL_ICON = '/images/bell.svg'

const Header = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { data: ongoingGame } = useOngoingGame()
  const ongoing = ongoingGame?.hasOngoing ? ongoingGame : null

  const displayName = useMemo(() => user?.nickname?.trim() || user?.username || '玩家', [user])

  const avatarUrl = useMemo(() => user?.avatarUrl?.trim() || DEFAULT_AVATAR, [user])

  useEffect(() => {
    document.body.classList.toggle('profile-drawer-open', drawerOpen)
    return () => {
      document.body.classList.remove('profile-drawer-open')
    }
  }, [drawerOpen])

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
              <button className="ongoing-pill" type="button" onClick={handleContinueGame}>
                <span className="pill-label">继续对局</span>
                <span className="pill-title">{ongoing.title || '返回游戏'}</span>
              </button>
            ) : null}
            <button className="bell" type="button" aria-label="通知">
              <img src={BELL_ICON} alt="通知" />
            </button>

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
        username={user?.username}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
      />
    </div>
  )
}

const ProfileDrawer = ({ open, onClose, displayName, username, avatarUrl, onLogout }) => {
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
          <div className="profile-drawer__id">{username}</div>
        </div>
        <div className="profile-drawer__actions">
          <button type="button" className="profile-drawer__action">
            隐私模式
          </button>
          <button type="button" className="profile-drawer__action">
            消息中心
          </button>
          <button type="button" className="profile-drawer__action">
            个人资料
          </button>
          <button type="button" className="profile-drawer__action" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </aside>
    </div>
  )
}

export default Header

