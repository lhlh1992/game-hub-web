import './GameCard.css'

/**
 * 游戏数据卡片组件
 * @param {Object} props
 * @param {Object} props.game - 游戏数据对象
 * @param {string} props.game.id - 游戏ID
 * @param {string} props.game.name - 游戏名称
 * @param {string} props.game.modeLabel - 游戏模式标签（如"双人对战"）
 * @param {number} props.game.matches - 对局场次
 * @param {number} props.game.winRate - 胜率（0-1之间的小数）
 * @param {Function} props.onViewDetails - 查看详情回调函数
 * @param {Function} props.formatWinRate - 格式化胜率的函数
 */
const GameCard = ({ game, onViewDetails, formatWinRate }) => {
  const gameName = game.name || game.gameName || '未知游戏'
  const modeLabel = game.modeLabel || game.gameType || '--'
  const matches = game.matches ?? game.matchCount ?? 0
  const winRate = game.winRate ?? 0

  // 根据游戏ID或类型获取图标和颜色（不依赖名称语言）
  const getGameTheme = (gameId, gameTypeId) => {
    // 优先使用 gameTypeId，如果没有则使用 gameId
    const id = gameTypeId || gameId || 'default'
    const idLower = String(id).toLowerCase()
    
    // 根据游戏类型ID匹配对应的主题
    const gameThemes = {
      'gomoku': { 
        from: 'rgba(255, 107, 107, 0.15)', 
        to: 'rgba(255, 142, 83, 0.12)', 
        text: '#FF6B6B',
        icon: '⚫' // 棋子图标
      },
      'chinese-checkers': { 
        from: 'rgba(167, 139, 250, 0.15)', 
        to: 'rgba(196, 181, 253, 0.12)', 
        text: '#A78BFA',
        icon: '♟️'
      },
      'uno': { 
        from: 'rgba(59, 130, 246, 0.15)', 
        to: 'rgba(96, 165, 250, 0.12)', 
        text: '#3B82F6',
        icon: '🃏'
      },
      'default': { 
        from: 'rgba(16, 185, 129, 0.15)', 
        to: 'rgba(52, 211, 153, 0.12)', 
        text: '#10B981',
        icon: '🎮'
      }
    }
    
    // 精确匹配
    if (gameThemes[idLower]) {
      return gameThemes[idLower]
    }
    
    // 模糊匹配（包含关键词）
    if (idLower.includes('gomoku') || idLower.includes('五子棋')) {
      return gameThemes['gomoku']
    }
    if (idLower.includes('checkers') || idLower.includes('跳棋')) {
      return gameThemes['chinese-checkers']
    }
    if (idLower.includes('uno')) {
      return gameThemes['uno']
    }
    
    // 默认使用哈希值生成稳定颜色
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    const defaultThemes = [
      { from: 'rgba(255, 107, 107, 0.15)', to: 'rgba(255, 142, 83, 0.12)', text: '#FF6B6B', icon: '🎮' },
      { from: 'rgba(167, 139, 250, 0.15)', to: 'rgba(196, 181, 253, 0.12)', text: '#A78BFA', icon: '♟️' },
      { from: 'rgba(59, 130, 246, 0.15)', to: 'rgba(96, 165, 250, 0.12)', text: '#3B82F6', icon: '🃏' },
      { from: 'rgba(16, 185, 129, 0.15)', to: 'rgba(52, 211, 153, 0.12)', text: '#10B981', icon: '🎯' },
      { from: 'rgba(245, 158, 11, 0.15)', to: 'rgba(251, 191, 36, 0.12)', text: '#F59E0B', icon: '🎲' },
    ]
    
    return defaultThemes[Math.abs(hash) % defaultThemes.length]
  }

  const theme = getGameTheme(game.id, game.gameTypeId)

  return (
    <div className="game-card">
      {/* 顶部：图标 + 名称 + 标签 */}
      <div className="game-card-header">
        <div 
          className="game-card-icon"
          style={{
            background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`
          }}
        >
          <span className="game-card-icon-emoji">{theme.icon}</span>
        </div>
        <div className="game-card-title">
          <h3 className="game-card-name">{gameName}</h3>
          <span className="game-card-mode">{modeLabel}</span>
        </div>
      </div>

      {/* 中部：统计数据 - 大号数字展示 */}
      <div className="game-card-stats">
        <div className="game-card-stat">
          <div className="game-card-stat-number">{matches}</div>
          <div className="game-card-stat-label">对局场次</div>
        </div>
        <div className="game-card-stat-divider"></div>
        <div className="game-card-stat">
          <div className="game-card-stat-number">{formatWinRate(winRate)}</div>
          <div className="game-card-stat-label">胜率</div>
        </div>
      </div>

      {/* 底部：查看详情按钮 */}
      <button 
        className="game-card-button"
        onClick={() => onViewDetails(game.gameTypeId || game.id)}
      >
        <span>查看详情</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

export default GameCard

