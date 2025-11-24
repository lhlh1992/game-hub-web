import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import GlobalChat from '../chat/GlobalChat.jsx'

const AppLayout = () => {
  const location = useLocation()
  const isHomePage = location.pathname === '/'

  return (
    <div className="app-shell">
      <Header />
      <main className={`app-content ${isHomePage ? 'app-content--wide' : ''}`}>
        <Outlet />
      </main>
      <GlobalChat />
    </div>
  )
}

export default AppLayout

