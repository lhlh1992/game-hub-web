import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import GameCard from './GameCard.jsx'

const DEFAULT_AVATAR = '/images/avatar-default.png'

// GameStatsSection 组件
const GameStatsSection = ({ games, loading, onViewDetails, formatWinRate }) => {
  return (
    <div className="profile-stats-card-modern">
      <div className="profile-stats-header-modern">
        <h2 className="profile-stats-title-modern">我的游戏数据</h2>
        <span className="profile-stats-badge-modern">Game Stats</span>
      </div>

      {loading ? (
        <div className="profile-loading-container">
          <div className="profile-loading-spinner"></div>
          <p className="profile-loading-text">加载中...</p>
        </div>
      ) : games.length === 0 ? (
        <div className="profile-empty-container-modern">
          <div className="profile-empty-icon-modern">🎮</div>
          <p className="profile-empty-title-modern">暂无游戏数据</p>
          <p className="profile-empty-desc-modern">去大厅开始一局游戏试试吧</p>
        </div>
      ) : (
        <div className="profile-game-cards-grid-modern">
          {games.map((game) => (
            <GameCard
              key={game.id || game.gameTypeId}
              game={game}
              onViewDetails={onViewDetails}
              formatWinRate={formatWinRate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ProfileHome = ({ user, onEdit }) => {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const [gameStats, setGameStats] = useState([])
  const [recentMatches, setRecentMatches] = useState([])
  const [loading, setLoading] = useState(true)

  const displayAvatarUrl = useMemo(() => {
    if (!user?.avatarUrl) return DEFAULT_AVATAR
    const avatarVersion = user?.updatedAt || user?.avatarUpdatedAt || user?.lastModifiedAt || Date.now()
    return `${user.avatarUrl}${user.avatarUrl.includes('?') ? '&' : '?'}t=${avatarVersion}`
  }, [user])

  const displayName = user?.nickname?.trim() || user?.username || '未设置昵称'
  const username = user?.username || '未知用户'
  const bio = user?.bio?.trim() || ''


  // 加载游戏统计数据（TODO: 需要后端API）
  useEffect(() => {
    // 模拟数据
    setTimeout(() => {
      setGameStats([
        {
          id: 'gomoku',
          gameTypeId: 'gomoku',
          name: '五子棋',
          gameName: '五子棋',
          modeLabel: '双人对战',
          gameType: '双人对战',
          matches: 0,
          matchCount: 0,
          winRate: 0,
          lastMatchTime: null,
          iconUrl: '/images/games/gomoku.png',
          gameIcon: '/images/games/gomoku.png'
        }
      ])
      setRecentMatches([])
      setLoading(false)
    }, 300)
  }, [])

  const formatWinRate = (rate) => {
    if (!rate && rate !== 0) return '--'
    return `${(rate * 100).toFixed(1)}%`
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    if (days > 0) return `${days}天前`
    if (hours > 0) return `${hours}小时前`
    if (minutes > 0) return `${minutes}分钟前`
    return '刚刚'
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}分${secs}秒`
  }

  const handleViewGameDetails = (gameTypeId) => {
    // TODO: 跳转到该游戏的个人战绩页面
    alert(`查看 ${gameTypeId} 的详细战绩（功能开发中）`)
  }

  const handleViewFriends = () => {
    navigate('/friends')
  }

  // 玩家ID（从后端获取，存储在数据库中）
  const playerId = user?.playerId || user?.displayId || '--'

  return (
    <div className="profile-center-container">
      {/* 1. 顶部：玩家信息卡片 */}
      <div className="profile-player-info-card">
        <div className="profile-player-info-content">
          {/* 左侧：头像 */}
          <div className="profile-player-avatar-section">
            <div
              className="profile-player-avatar-large"
              style={{ backgroundImage: `url('${displayAvatarUrl}')` }}
            />
          </div>

          {/* 右侧：信息 */}
          <div className="profile-player-info-section">
            <h1 className="profile-player-name-large">{displayName}</h1>
            
            <div className="profile-player-id-section">
              <span className="profile-player-id-label">玩家ID:</span>
              <code className="profile-player-id-code">{playerId}</code>
              <button 
                className="profile-player-id-copy-btn"
                onClick={() => {
                  if (playerId && playerId !== '--') {
                    navigator.clipboard.writeText(playerId)
                      .then(() => alert(`玩家ID ${playerId} 已复制`))
                      .catch(() => {})
                  }
                }}
                title="复制玩家ID"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.5 2H5.5C4.4 2 3.5 2.9 3.5 4V10.5C3.5 11.6 4.4 12.5 5.5 12.5H10.5C11.6 12.5 12.5 11.6 12.5 10.5V4C12.5 2.9 11.6 2 10.5 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8.5 8.5H2.5C2.5 7.4 3.4 6.5 4.5 6.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {bio && (
              <p className="profile-player-bio-text">{bio}</p>
            )}

            <div className="profile-player-actions">
              <button className="profile-player-edit-button" onClick={onEdit}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12.75 3.25a1.5 1.5 0 0 1 2.12 2.12L6 14.25l-3.75 1 1-3.75L12.75 3.25z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                编辑个人信息
              </button>
              <button className="profile-player-friends-button" onClick={handleViewFriends}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 9C11.4853 9 13.5 6.98528 13.5 4.5C13.5 2.01472 11.4853 0 9 0C6.51472 0 4.5 2.01472 4.5 4.5C4.5 6.98528 6.51472 9 9 9Z" fill="currentColor"/>
                  <path d="M9 10.8C5.02355 10.8 1.8 12.4118 1.8 14.4V18H16.2V14.4C16.2 12.4118 12.9765 10.8 9 10.8Z" fill="currentColor"/>
                  <path d="M14.4 7.2C15.3929 7.2 16.2 6.39285 16.2 5.4C16.2 4.40715 15.3929 3.6 14.4 3.6C13.4071 3.6 12.6 4.40715 12.6 5.4C12.6 6.39285 13.4071 7.2 14.4 7.2Z" fill="currentColor"/>
                  <path d="M16.2 10.8C16.2 9.80715 15.3929 9 14.4 9C13.4071 9 12.6 9.80715 12.6 10.8V12.6H16.2V10.8Z" fill="currentColor"/>
                </svg>
                查看好友列表
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 我的游戏数据 */}
      <GameStatsSection 
        games={gameStats}
        loading={loading}
        onViewDetails={handleViewGameDetails}
        formatWinRate={formatWinRate}
      />

      {/* 3. 最近对局 */}
      <div className="profile-matches-card">
        <div className="profile-matches-header">
          <h2 className="profile-matches-title">最近对局</h2>
        </div>

        {recentMatches.length === 0 ? (
          <div className="profile-empty-container">
            <div className="profile-empty-icon-large">📋</div>
            <p className="profile-empty-title">暂无对局记录</p>
            <p className="profile-empty-desc">开始一局游戏试试吧</p>
          </div>
        ) : (
          <div className="profile-match-list">
            {recentMatches.map((match) => (
              <div key={match.id} className="profile-match-row">
                <div className="profile-match-icon-wrapper">
                  {match.gameIcon ? (
                    <img src={match.gameIcon} alt={match.gameName} className="profile-match-icon-img" />
                  ) : (
                    <div className="profile-match-icon-placeholder">{match.gameName?.charAt(0) || '?'}</div>
                  )}
                </div>
                <div className="profile-match-info-wrapper">
                  <div className="profile-match-header-row">
                    <span className="profile-match-game-name">{match.gameName || '未知游戏'}</span>
                    <span className={`profile-match-result-badge profile-match-result-${match.result?.toLowerCase() || 'unknown'}`}>
                      {match.result === 'WIN' ? '胜利' : match.result === 'LOSE' ? '失败' : match.result === 'DRAW' ? '平局' : '--'}
                    </span>
                  </div>
                  <div className="profile-match-details-row">
                    <span className="profile-match-opponent">
                      {match.opponentName || (match.playerCount ? `${match.playerCount}人游戏` : '--')}
                    </span>
                    <span className="profile-match-separator">·</span>
                    <span className="profile-match-time">{formatTime(match.finishedAt || match.startedAt)}</span>
                    {match.durationSeconds && (
                      <>
                        <span className="profile-match-separator">·</span>
                        <span className="profile-match-duration">{formatDuration(match.durationSeconds)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfileHome
