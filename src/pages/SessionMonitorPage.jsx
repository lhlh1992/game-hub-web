import { useEffect, useState } from 'react'
import { getAllSessions } from '../services/api/sessionMonitor.js'
import { useAuth } from '../hooks/useAuth.js'
import '../styles/sessionMonitor.css'

const SessionMonitorPage = () => {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const { user } = useAuth()
  
  // 获取当前用户的 Keycloak ID（用于匹配）
  const currentUserId = user?.keycloakUserId || user?.id

  const fetchSessions = async () => {
    try {
      setError(null)
      const data = await getAllSessions()
      setSessions(data || [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('获取会话信息失败', err)
      setError(err.message || '获取会话信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
    // 每2秒轮询一次
    const interval = setInterval(fetchSessions, 2000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (timestamp) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      ACTIVE: { text: '活跃', class: 'status-active' },
      KICKED: { text: '已踢下线', class: 'status-kicked' },
      EXPIRED: { text: '已过期', class: 'status-expired' },
    }
    const statusInfo = statusMap[status] || { text: status, class: 'status-unknown' }
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>
  }

  if (loading && sessions.length === 0) {
    return (
      <div className="session-monitor-page">
        <div className="session-monitor-loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="session-monitor-page">
      <div className="session-monitor-header">
        <h1>会话监控</h1>
        <div className="session-monitor-info">
          <span className="info-item">在线用户: {sessions.length}</span>
          {lastUpdate && (
            <span className="info-item">最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}</span>
          )}
          {error && <span className="info-item error">错误: {error}</span>}
        </div>
      </div>

      {error && sessions.length === 0 ? (
        <div className="session-monitor-error">
          <p>加载失败: {error}</p>
          <button onClick={fetchSessions}>重试</button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="session-monitor-empty">暂无在线用户</div>
      ) : (
        <div className="session-monitor-list">
          {sessions.map((userSession) => {
            // 兼容新旧数据结构：新数据有 userId，旧数据在 sessionSnapshot 中
            const key = userSession.userId || userSession.sessionSnapshot?.userId || JSON.stringify(userSession)
            const userId = userSession.userId || userSession.sessionSnapshot?.userId
            const isCurrentUser = currentUserId && userId && String(currentUserId) === String(userId)
            return (
              <UserSessionCard 
                key={key} 
                userSession={userSession} 
                formatTime={formatTime} 
                getStatusBadge={getStatusBadge}
                isCurrentUser={isCurrentUser}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

const UserSessionCard = ({ userSession, formatTime, getStatusBadge, isCurrentUser = false }) => {
  const [expanded, setExpanded] = useState(false)
  // 兼容新旧数据结构：新数据有 sessionSnapshot，旧数据直接是会话信息
  const sessionSnapshot = userSession.sessionSnapshot || userSession
  const loginSessions = sessionSnapshot.loginSessions || []
  const wsSessions = sessionSnapshot.webSocketSessions || []
  const totalCount = loginSessions.length + wsSessions.length
  
  // 获取用户显示名称：优先显示昵称，其次用户名，最后用户ID
  const displayName = userSession.nickname || userSession.username || userSession.userId
  const userId = userSession.userId || sessionSnapshot.userId

  return (
    <div className={`user-session-card ${isCurrentUser ? 'current-user' : ''}`}>
      <div className="user-session-header" onClick={() => setExpanded(!expanded)}>
        <div className="user-session-title">
          <span className="user-id">
            {isCurrentUser && <span className="current-user-badge">我</span>}
            {userSession.nickname ? (
              <>
                用户: <span className="user-nickname">{userSession.nickname}</span>
                {userSession.username && <span className="user-username">({userSession.username})</span>}
              </>
            ) : (
              `用户: ${displayName}`
            )}
          </span>
          <span className="session-count">
            登录会话: {loginSessions.length} | WebSocket: {wsSessions.length} | 总计: {totalCount}
          </span>
        </div>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="user-session-details">
          {/* 登录会话列表 */}
          <div className="session-section">
            <h3 className="section-title">登录会话 ({loginSessions.length})</h3>
            {loginSessions.length === 0 ? (
              <div className="empty-section">无登录会话</div>
            ) : (
              <div className="session-list">
                {loginSessions.map((session, idx) => (
                  <div key={session.sessionId || idx} className="session-item login-session">
                    <div className="session-item-header">
                      <span className="session-id">SessionId: {session.sessionId || '-'}</span>
                      {getStatusBadge(session.status)}
                    </div>
                    <div className="session-item-details">
                      <div className="detail-row">
                        <span className="detail-label">LoginSessionId:</span>
                        <span className="detail-value">{session.loginSessionId || '(空)'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">签发时间:</span>
                        <span className="detail-value">{formatTime(session.issuedAt)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">过期时间:</span>
                        <span className="detail-value">{formatTime(session.expiresAt)}</span>
                      </div>
                      {session.attributes && Object.keys(session.attributes).length > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">属性:</span>
                          <span className="detail-value">{JSON.stringify(session.attributes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WebSocket 会话列表 */}
          <div className="session-section">
            <h3 className="section-title">WebSocket 连接 ({wsSessions.length})</h3>
            {wsSessions.length === 0 ? (
              <div className="empty-section">无 WebSocket 连接</div>
            ) : (
              <div className="session-list">
                {wsSessions.map((session, idx) => (
                  <div key={session.sessionId || idx} className="session-item ws-session">
                    <div className="session-item-header">
                      <span className="session-id">SessionId: {session.sessionId || '-'}</span>
                      <span className="service-badge">{session.service || 'unknown'}</span>
                    </div>
                    <div className="session-item-details">
                      <div className="detail-row">
                        <span className="detail-label">LoginSessionId:</span>
                        <span className="detail-value">{session.loginSessionId || '(空)'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">连接时间:</span>
                        <span className="detail-value">{formatTime(session.connectedAt)}</span>
                      </div>
                      {session.attributes && Object.keys(session.attributes).length > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">属性:</span>
                          <span className="detail-value">{JSON.stringify(session.attributes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SessionMonitorPage

