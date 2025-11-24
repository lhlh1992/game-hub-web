const LobbyPage = () => {
  return (
    <section className="page">
      <h1>游戏大厅（React 版本搭建中）</h1>
      <p>
        这里将迁移 lobby.html 中的所有内容，包括模式卡片、模态框、人机模式、匹配流程等。
      </p>
      <ul>
        <li>模态框交互将封装成组件，支持受控状态。</li>
        <li>API 调用将通过 services/api 模块统一管理。</li>
        <li>登录检查将由 ProtectedRoute + useAuth 负责。</li>
      </ul>
    </section>
  )
}

export default LobbyPage

