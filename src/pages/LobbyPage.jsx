import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/lobby.css'
import { createRoom, listGomokuRooms, joinRoom } from '../services/api/gameApi.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const RULE_ITEMS = [
  {
    icon: '🎯',
    title: '基本规则',
    description:
      '五子棋是在15×15的棋盘上进行的两人对弈游戏。双方轮流在棋盘上落子，黑子先行。率先在横、竖、斜任意方向连成五子的玩家获胜。',
  },
  {
    icon: '🚫',
    title: '禁手规则（连珠模式）',
    description:
      '在连珠模式下，黑棋有禁手限制：不能形成双三、双四、长连（超过五子）等禁手。白棋无禁手限制。黑棋若下出禁手，则判负。',
  },
  {
    icon: '⚡',
    title: '游戏模式',
    description:
      '人机对战：与AI对手对战，可选择AI执黑或执白。创建房间：创建私人房间，通过房间ID邀请好友加入。在线匹配：系统自动为你匹配实力相近的对手。',
  },
]

const DEFAULT_CREATE_FORM = {
  mode: 'PVP', // 固定为PVP，不再显示模式选择
  rule: 'STANDARD',
}

const LobbyPage = () => {
  const { user } = useAuth()
  const [pveModalOpen, setPveModalOpen] = useState(false)
  const [pveRule, setPveRule] = useState('STANDARD')
  const [pveStatus, setPveStatus] = useState({ message: '', variant: '' })
  const [pveSubmitting, setPveSubmitting] = useState(false)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM)
  const [createStatus, setCreateStatus] = useState({ message: '', variant: '' })
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const [enterModalOpen, setEnterModalOpen] = useState(false)
  const [roomId, setRoomId] = useState('')

  const [rooms, setRooms] = useState([])
  const [roomsCursor, setRoomsCursor] = useState(null)
  const [roomsHasMore, setRoomsHasMore] = useState(true)
  const [refreshingRooms, setRefreshingRooms] = useState(false)
  const [loadingMoreRooms, setLoadingMoreRooms] = useState(false)

  const [matchmakingModalOpen, setMatchmakingModalOpen] = useState(false)
  const navigate = useNavigate()

  // 获取当前用户ID（用于判断是否是自己的房间）
  const currentUserId = user?.keycloakUserId || user?.id || user?.sub || null

  // 在线房间列表：首屏加载
  useEffect(() => {
    const loadInitialRooms = async () => {
      try {
        setRefreshingRooms(true)
        const res = await listGomokuRooms({ limit: 4 })
        const mapped = (res.items || []).map((item) => mapRoomSummaryToView(item, currentUserId))
        setRooms(mapped)
        setRoomsCursor(res.nextCursor || null)
        setRoomsHasMore(!!res.nextCursor)
      } catch (e) {
        // 加载房间列表失败，静默处理
      } finally {
        setRefreshingRooms(false)
      }
    }
    loadInitialRooms()
  }, [currentUserId])

  // 不再需要 ensureToken，createRoom 会自动从 Keycloak 获取 token

  const showPVEModal = () => {
    setPveRule('STANDARD')
    setPveStatus({ message: '', variant: '' })
    setPveModalOpen(true)
  }

  const showCreateModal = () => {
    setCreateForm(DEFAULT_CREATE_FORM)
    setCreateStatus({ message: '', variant: '' })
    setCreateModalOpen(true)
  }

  const showEnterModal = () => {
    setRoomId('')
    setEnterModalOpen(true)
  }

  const handlePVE = async () => {
    if (pveSubmitting) return
    setPveSubmitting(true)
    setPveStatus({ message: '正在进入游戏...', variant: '' })
    try {
      const id = await createRoom({ mode: 'PVE', aiPiece: 'O', rule: pveRule })
      navigate(`/game/${id}`)
    } catch (error) {
      setPveStatus({ message: `创建失败：${error.message}`, variant: 'error' })
    } finally {
      setPveSubmitting(false)
    }
  }

  const handleCreateRoom = async () => {
    if (createSubmitting) return
    setCreateSubmitting(true)
    setCreateStatus({ message: '创建中...', variant: '' })
    try {
      // 固定为PVP模式，不传aiPiece参数
      const id = await createRoom({ mode: 'PVP', rule: createForm.rule })
      setCreateStatus({ message: '房间创建成功', variant: 'success' })
      setTimeout(() => {
        navigate(`/game/${id}`)
      }, 500)
    } catch (error) {
      setCreateStatus({ message: `创建失败：${error.message}`, variant: 'error' })
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleEnterRoom = () => {
    const trimmed = roomId.trim()
    if (!trimmed) {
      window.alert('请输入房间 ID')
      return
    }
    setEnterModalOpen(false)
    navigate(`/game/${trimmed}`)
  }

  const showMatchmakingModal = () => {
    setMatchmakingModalOpen(true)
  }

  const statusClass = (variant) => {
    if (!variant) return 'status-message'
    return `status-message ${variant}`
  }

  const ruleContent = useMemo(
    () =>
      RULE_ITEMS.map((rule) => (
        <div key={rule.title} className="rule-item">
          <div className="rule-icon">{rule.icon}</div>
          <div className="rule-text">
            <h4>{rule.title}</h4>
            <p>{rule.description}</p>
          </div>
        </div>
      )),
    [],
  )

  return (
    <>
      <main className="lobby-container">
        <div className="lobby-header">
          <h1 className="lobby-title">五子棋</h1>
          <p className="lobby-subtitle">选择你的游戏模式</p>
        </div>

        <section className="mode-room-wrapper">
          <div className="mode-left">
            <div className="mode-modes-panel">
              <div className="game-modes-left">
                <ModeCard icon="🤖" title="人机对战" description="与AI对手进行对战，提升你的棋艺" actionLabel="开始游戏" onAction={showPVEModal} />

                <ModeCard
                  icon="🏠"
                  title="创建房间"
                  description="创建对战房间，邀请好友一起对战"
                  actionLabel="创建房间"
                  onAction={showCreateModal}
                />

                <ModeCard
                  icon="⚔️"
                  title="在线匹配"
                  description="快速匹配其他玩家，开始一场精彩对决"
                  actionLabel="开始匹配"
                  onAction={showMatchmakingModal}
                />
              </div>
            </div>
          </div>

          <RoomListPanel
            rooms={rooms}
            refreshing={refreshingRooms}
            loadingMore={loadingMoreRooms}
            hasMore={roomsHasMore}
            onRefresh={async () => {
              if (refreshingRooms) return
              try {
                setRefreshingRooms(true)
                const res = await listGomokuRooms({ limit: 4 })
                const mapped = (res.items || []).map((item) => mapRoomSummaryToView(item, currentUserId))
                setRooms(mapped)
                setRoomsCursor(res.nextCursor || null)
                setRoomsHasMore(!!res.nextCursor)
              } catch (e) {
                // 刷新房间列表失败，静默处理
              } finally {
                setRefreshingRooms(false)
              }
            }}
            onLoadMore={async () => {
              if (loadingMoreRooms || !roomsHasMore || !roomsCursor) return
              try {
                setLoadingMoreRooms(true)
                const res = await listGomokuRooms({ cursor: roomsCursor, limit: 4 })
                const mapped = (res.items || []).map((item) => mapRoomSummaryToView(item, currentUserId))
                setRooms((prev) => [...prev, ...mapped])
                setRoomsCursor(res.nextCursor || null)
                setRoomsHasMore(!!res.nextCursor)
              } catch (e) {
                // 加载更多房间失败，静默处理
              } finally {
                setLoadingMoreRooms(false)
              }
            }}
          />
        </section>

        <section className="rules-section">
          <h2 className="rules-title">游戏规则</h2>
          <div className="rules-content">{ruleContent}</div>
        </section>
      </main>

      <Modal open={pveModalOpen} onClose={() => setPveModalOpen(false)}>
        <div className="modal-header">
          <h3>人机对战</h3>
          <button type="button" className="modal-close" onClick={() => setPveModalOpen(false)}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>
              <span>规则：</span>
              <select value={pveRule} onChange={(e) => setPveRule(e.target.value)}>
                <option value="STANDARD">标准</option>
                <option value="RENJU">连珠（禁手）</option>
              </select>
            </label>
          </div>
          {pveStatus.message && <div className={statusClass(pveStatus.variant)}>{pveStatus.message}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={() => setPveModalOpen(false)} disabled={pveSubmitting}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={handlePVE} disabled={pveSubmitting}>
            开始游戏
          </button>
        </div>
      </Modal>

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)}>
        <div className="modal-header">
          <h3>创建房间</h3>
          <button type="button" className="modal-close" onClick={() => setCreateModalOpen(false)}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>
              <span>规则：</span>
              <select value={createForm.rule} onChange={(e) => setCreateForm((prev) => ({ ...prev, rule: e.target.value }))}>
                <option value="STANDARD">标准</option>
                <option value="RENJU">连珠（禁手）</option>
              </select>
            </label>
          </div>
          {createStatus.message && <div className={statusClass(createStatus.variant)}>{createStatus.message}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={() => setCreateModalOpen(false)} disabled={createSubmitting}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={handleCreateRoom} disabled={createSubmitting}>
            创建
          </button>
        </div>
      </Modal>

      <Modal open={enterModalOpen} onClose={() => setEnterModalOpen(false)}>
        <div className="modal-header">
          <h3>进入房间</h3>
          <button type="button" className="modal-close" onClick={() => setEnterModalOpen(false)}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>
              <span>房间ID：</span>
              <input
                type="text"
                value={roomId}
                placeholder="输入房间ID"
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleEnterRoom()
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={() => setEnterModalOpen(false)}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={handleEnterRoom}>
            进入
          </button>
        </div>
      </Modal>

      <div
        className="modal"
        style={{ display: matchmakingModalOpen ? 'flex' : 'none' }}
        role="dialog"
        aria-modal="true"
        onClick={(event) => {
          // 点击背景不关闭，只能通过按钮关闭
          event.stopPropagation()
        }}
      >
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>在线匹配</h3>
            <button type="button" className="modal-close" onClick={() => setMatchmakingModalOpen(false)}>
              &times;
            </button>
          </div>
          <div className="modal-body">
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚔️</div>
              <p style={{ fontSize: '18px', color: '#666', margin: 0, lineHeight: '1.6' }}>
                匹配功能暂未开放
              </p>
              <p style={{ fontSize: '14px', color: '#999', margin: '12px 0 0', lineHeight: '1.5' }}>
                请使用「创建房间」或「人机对战」功能
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn primary" onClick={() => setMatchmakingModalOpen(false)}>
              知道了
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const ModeCard = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  actionDisabled,
  hideActionButton = false,
  footer = null,
}) => {
  return (
    <div className="mode-card">
      <div className="mode-icon">{icon}</div>
      <h3 className="mode-title">{title}</h3>
      <p className="mode-desc">{description}</p>
      {!hideActionButton && (
        <button type="button" className="mode-btn primary" onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </button>
      )}
      {footer}
      {children}
    </div>
  )
}

// 将后端 RoomSummary 映射为前端展示模型的辅助函数
function mapRoomSummaryToView(summary, currentUserId = null) {
  const phase = summary.phase || 'WAITING'
  const deleted = summary.deleted
  // 临时：人数/容量用简单规则占位，后续可接真实在线人数
  const players = deleted ? 0 : phase === 'PLAYING' ? 2 : 1
  const capacity = 2
  const statusText = deleted ? '已关闭' : phase === 'PLAYING' ? '进行中' : '等待中'
  // 昵称：优先使用后端的 ownerName，退化为一个通用"玩家"
  const rawOwner = summary.ownerName || ''
  const displayName = rawOwner && rawOwner.trim().length > 0 ? rawOwner.trim() : '玩家'
  // 判断是否是自己的房间
  const isMyRoom = currentUserId && summary.ownerUserId && summary.ownerUserId === currentUserId
  return {
    id: summary.roomId,
    owner: displayName,
    ownerUserId: summary.ownerUserId,
    isMyRoom,
    avatar: '/images/avatar-default.png',
    rule: summary.rule || 'STANDARD',
    status: statusText,
    players,
    capacity,
    deleted,
  }
}

const RoomListPanel = ({ rooms, refreshing, loadingMore, hasMore, onRefresh, onLoadMore }) => {
  const navigate = useNavigate()
  const isEmpty = !rooms || rooms.length === 0
  const [joiningRoomId, setJoiningRoomId] = useState(null)
  const [joinError, setJoinError] = useState(null)

  const handleJoin = async (room) => {
    // 房主不能点击（按钮已置灰，这里做双重保护）
    if (room.isMyRoom) {
      return
    }

    // 防止重复点击
    if (joiningRoomId) {
      return
    }

    try {
      setJoiningRoomId(room.id)
      // 调用加入房间接口，自动绑定座位
      await joinRoom(room.id)
      // 加入成功后跳转到房间页面
      navigate(`/game/${room.id}`)
    } catch (error) {
      // 加入房间失败，静默处理
      setJoinError(error.message || '加入房间失败')
    } finally {
      setJoiningRoomId(null)
    }
  }

  return (
    <aside className="room-list-panel">
      {joinError && (
        <div
          className="join-error-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: '360px',
              borderRadius: '20px',
              padding: '24px 28px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(245,248,255,0.9))',
              boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
              color: '#1f2a44',
              fontFamily: '"Inter","PingFang SC",sans-serif',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#111827' }}>
              无法加入房间
            </div>
            <div style={{ fontSize: '14px', lineHeight: 1.6, color: '#4b5563', marginBottom: '18px' }}>
              {joinError}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setJoinError(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#111827',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 10px 20px rgba(17,24,39,0.12)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="room-list-header">
        <div>
          <h2 className="room-list-title">在线房间列表</h2>
          <p className="room-list-subtitle">加入其他玩家创建的五子棋房间，实时参与对局</p>
        </div>
        <div className="room-list-actions">
          <button type="button" className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '刷新中…' : '刷新列表'}
          </button>
          <span className="room-list-count">{rooms.length} Rooms</span>
        </div>
      </div>

      <div className="room-list-body">
        {isEmpty ? (
          <div className="room-list-empty">
            <div className="room-list-empty-icon">🏠</div>
            <div className="room-list-empty-text">当前暂无公开房间</div>
            <div className="room-list-empty-sub">点击左侧「创建房间」，成为第一个房主</div>
          </div>
        ) : (
          rooms.map((room) => {
            const full = room.players >= room.capacity
            return (
              <div key={room.id} className={`room-card ${room.isMyRoom ? 'room-card-my' : ''}`}>
                <div className="room-card-owner">
                  <img className="room-avatar" src={room.avatar} alt={room.owner} />
                  <div>
                    <div className="owner-name">
                      {room.owner}
                      {room.isMyRoom && <span className="owner-badge">我的房间</span>}
                    </div>
                  </div>
                </div>
                <div className="room-card-meta">
                  <span className="room-tag">
                    {`PVP · ${room.rule === 'RENJU' || room.rule === '禁手' ? '禁手' : '标准'}`}
                  </span>
                </div>
                <div className="room-card-status">
                  <span className="room-players">
                    👥 {room.players}/{room.capacity}
                  </span>
                  <span className={`room-state ${room.status === '进行中' ? 'live' : 'waiting'}`}>{room.status}</span>
                </div>
                <div className="room-card-action">
                  <button
                    type="button"
                    className={`join-btn ${room.isMyRoom ? 'join-btn-my' : ''}`}
                    onClick={() => handleJoin(room)}
                    disabled={
                      room.isMyRoom || 
                      room.deleted || 
                      (full && room.status !== '进行中') ||
                      joiningRoomId === room.id
                    }
                  >
                    {joiningRoomId === room.id
                      ? '加入中...'
                      : room.deleted
                        ? '已关闭'
                        : full && room.status !== '进行中'
                          ? '已满'
                          : room.isMyRoom
                            ? '我的房间'
                            : room.status === '进行中'
                              ? '观战'
                              : '加入'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="room-list-footer">
        <button
          type="button"
          className="load-more-btn"
          onClick={onLoadMore}
          disabled={loadingMore || !hasMore}
        >
          {loadingMore ? 'Loading…' : hasMore ? 'Load more' : 'No more rooms'}
        </button>
      </div>
    </aside>
  )
}

const Modal = ({ open, onClose, children }) => {
  return (
    <div
      className="modal"
      style={{ display: open ? 'flex' : 'none' }}
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="modal-content">{children}</div>
    </div>
  )
}

export default LobbyPage

