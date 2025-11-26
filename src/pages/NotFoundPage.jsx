import { Link } from 'react-router-dom'

const NotFoundPage = () => {
  return (
    <section className="page page--centered">
      <h1>页面找不到</h1>
      <p>暂未匹配到该路由，请返回首页或进入游戏大厅。</p>
      <div className="hero-actions">
        <Link className="gh-btn gh-btn--primary" to="/">
          回到首页
        </Link>
        <Link className="gh-btn gh-btn--ghost" to="/lobby">
          游戏大厅
        </Link>
      </div>
    </section>
  )
}

export default NotFoundPage






