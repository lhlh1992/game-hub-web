import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/lobby.css'
import { createRoom } from '../services/api/gameApi.js'

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
  mode: 'PVP',
  aiPiece: 'O',
  rule: 'STANDARD',
}

const LobbyPage = () => {
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

  // 临时：在线房间 mock 数据（后续可替换为真实接口）
  const mockRooms = useMemo(
    () => [
      {
        id: '8FA1D2BC',
        owner: '刘辉',
        avatar: '/images/avatar-default.png',
        mode: 'PVP',
        status: '等待中',
        players: 1,
        capacity: 2,
        rule: '标准',
      },
      {
        id: 'A7C30E11',
        owner: '星耀玩家',
        avatar: '/images/avatar-default.png',
        mode: 'PVP',
        status: '进行中',
        players: 2,
        capacity: 2,
        rule: '禁手',
      },
      {
        id: 'C1BB3D57',
        owner: '阿七',
        avatar: '/images/avatar-default.png',
        mode: 'PVP',
        status: '等待中',
        players: 1,
        capacity: 2,
        rule: '标准',
      },
      {
        id: 'D5F42E19',
        owner: '老棋手',
        avatar: '/images/avatar-default.png',
        mode: 'PVP',
        status: '进行中',
        players: 2,
        capacity: 2,
        rule: '标准',
      },
    ],
    [],
  )
  const [rooms, setRooms] = useState(mockRooms)
  const [refreshingRooms, setRefreshingRooms] = useState(false)

  const [isMatchmaking, setIsMatchmaking] = useState(false)
  const matchmakingPollRef = useRef(null)
  const matchmakingSuccessRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Keycloak 已在应用启动时初始化，这里不需要再次检查认证
    return () => {
      if (matchmakingPollRef.current) {
        clearInterval(matchmakingPollRef.current)
        matchmakingPollRef.current = null
      }
      if (matchmakingSuccessRef.current) {
        clearTimeout(matchmakingSuccessRef.current)
        matchmakingSuccessRef.current = null
      }
    }
  }, [])

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
      const id = await createRoom({ ...createForm })
      setCreateStatus({ message: `房间创建成功：${id}`, variant: 'success' })
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

  const startMatchmaking = () => {
    if (isMatchmaking) return
    setIsMatchmaking(true)
    if (matchmakingPollRef.current) {
      clearInterval(matchmakingPollRef.current)
    }
    matchmakingPollRef.current = setInterval(() => {
      console.debug('轮询匹配状态...')
    }, 2000)
    if (matchmakingSuccessRef.current) {
      clearTimeout(matchmakingSuccessRef.current)
    }
    matchmakingSuccessRef.current = setTimeout(() => {
      window.alert('匹配成功！功能开发中，请先使用创建房间。')
      cancelMatchmaking()
    }, 5000)
  }

  const cancelMatchmaking = useCallback(() => {
    setIsMatchmaking(false)
    if (matchmakingPollRef.current) {
      clearInterval(matchmakingPollRef.current)
      matchmakingPollRef.current = null
    }
    if (matchmakingSuccessRef.current) {
      clearTimeout(matchmakingSuccessRef.current)
      matchmakingSuccessRef.current = null
    }
  }, [])

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
                  description="创建私人房间，邀请好友一起对战"
                  actionLabel="创建房间"
                  onAction={showCreateModal}
                >
                  <button type="button" className="link-btn" onClick={showEnterModal}>
                    输入房间 ID 进入
                  </button>
                </ModeCard>

                <ModeCard
                  icon="⚔️"
                  title="在线匹配"
                  description="快速匹配其他玩家，开始一场精彩对决"
                  actionLabel="开始匹配"
                  onAction={startMatchmaking}
                  actionDisabled={isMatchmaking}
                  hideActionButton={isMatchmaking}
                  footer={
                    isMatchmaking ? (
                      <div className="match-status">
                        <div className="match-loading">
                          <span className="loading-dot" />
                          <span className="loading-dot" />
                          <span className="loading-dot" />
                        </div>
                        <p className="match-text">正在匹配中...</p>
                        <button type="button" className="mode-btn cancel" onClick={cancelMatchmaking}>
                          取消匹配
                        </button>
                      </div>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>

          <RoomListPanel
            rooms={rooms}
            refreshing={refreshingRooms}
            onRefresh={() => {
              if (refreshingRooms) return
              setRefreshingRooms(true)
              setTimeout(() => {
                // 这里仅模拟刷新，未来可替换为真实接口
                setRooms((prev) => [...prev])
                setRefreshingRooms(false)
              }, 800)
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
              <span>模式：</span>
              <select value={createForm.mode} onChange={(e) => setCreateForm((prev) => ({ ...prev, mode: e.target.value }))}>
                <option value="PVE">PVE（人机）</option>
                <option value="PVP">PVP（人人）</option>
              </select>
            </label>
          </div>
          <div className="form-group">
            <label>
              <span>AI执子：</span>
              <select value={createForm.aiPiece} onChange={(e) => setCreateForm((prev) => ({ ...prev, aiPiece: e.target.value }))}>
                <option value="O">O（白）</option>
                <option value="X">X（黑）</option>
              </select>
            </label>
          </div>
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

const RoomListPanel = ({ rooms, refreshing, onRefresh }) => {
  const isEmpty = !rooms || rooms.length === 0

  const handleJoin = (room) => {
    // 先保留占位行为，后续接入真实加入房间逻辑
    window.alert(`加入房间 ${room.id}（示例，后续接入真实 API）`)
  }

  return (
    <aside className="room-list-panel">
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
              <div key={room.id} className="room-card">
                <div className="room-card-owner">
                  <img className="room-avatar" src={room.avatar} alt={room.owner} />
                  <div>
                    <div className="owner-name">{room.owner}</div>
                    <div className="room-id">ID: {room.id}</div>
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
                    className="join-btn"
                    onClick={() => handleJoin(room)}
                    disabled={full && room.status !== '进行中'}
                  >
                    {full && room.status !== '进行中' ? '已满' : room.status === '进行中' ? '观战' : '加入'}
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
          onClick={() => window.alert('Load more rooms（示例，后续接入分页/加载更多）')}
        >
          Load more
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

