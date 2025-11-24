const GameRoomPage = () => {
  return (
    <section className="page">
      <h1>游戏房间</h1>
      <p>五子棋棋盘、玩家信息、聊天面板等会在这里通过组件化方式挂载。</p>
      <div className="info-card">
        <h3>当前目标</h3>
        <ol>
          <li>迁移 game.html 的布局结构。</li>
          <li>拆分 game.js 的棋盘渲染 & 状态逻辑。</li>
          <li>对接 WebSocket（SockJS + STOMP）。</li>
        </ol>
      </div>
    </section>
  )
}

export default GameRoomPage

