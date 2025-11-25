import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'

const NAV_ITEMS = [
  { label: '大厅', path: '/', dataNav: 'home' },
  { label: '游戏', path: '/lobby', dataNav: 'lobby' },
  { label: '我的', path: '/profile', dataNav: 'profile' },
]

const DEFAULT_AVATAR = '/images/avatar-default.png'
const BELL_ICON = '/images/bell.svg'

const Header = () => {
  const location = useLocation()
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const displayName = useMemo(() => user?.nickname?.trim() || user?.username || '玩家', [user])

  const avatarUrl = useMemo(() => user?.avatarUrl?.trim() || DEFAULT_AVATAR, [user])

  const activeNav = useMemo(() => {
    if (location.pathname.startsWith('/lobby')) {
      return 'lobby'
    }
    if (location.pathname.startsWith('/profile')) {
      return 'profile'
    }
    return 'home'
  }, [location.pathname])

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

  const handleLogin = () => {
    login()
  }

  return (
    <div data-component="global-header" data-active={activeNav}>
      <header className="gh-header">
        <div className="gh-header-inner">
          <div className="logo">
            <div className="logo-square" />
            <span>GameHub</span>
          </div>

          <nav className="gh-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                data-nav={item.dataNav}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
                end={item.path === '/'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-tools">
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

