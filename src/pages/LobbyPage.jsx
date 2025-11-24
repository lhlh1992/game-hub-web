import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/lobby.css'
import { createRoom } from '../services/api/gameApi.js'
import { ensureAuthenticated } from '../services/auth/authService.js'

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
  const [token, setToken] = useState(null)
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

  const [isMatchmaking, setIsMatchmaking] = useState(false)
  const matchmakingTimeout = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      try {
        const ensured = await ensureAuthenticated()
        if (active) {
          setToken(ensured || null)
        }
      } catch (error) {
        console.error('大厅初始化失败', error)
      }
    }
    bootstrap()
    return () => {
      active = false
      if (matchmakingTimeout.current) {
        clearTimeout(matchmakingTimeout.current)
      }
    }
  }, [])

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
      const id = await createRoom({ mode: 'PVE', aiPiece: 'O', rule: pveRule, token })
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
      const id = await createRoom({ ...createForm, token })
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
    if (!roomId.trim()) {
      window.alert('请输入房间 ID')
      return
    }
    navigate(`/game/${roomId.trim()}`)
  }

  const startMatchmaking = () => {
    if (isMatchmaking) return
    setIsMatchmaking(true)
    matchmakingTimeout.current = setTimeout(() => {
      window.alert('匹配成功！功能开发中，请先使用创建房间。')
      cancelMatchmaking()
    }, 5000)
  }

  const cancelMatchmaking = () => {
    setIsMatchmaking(false)
    if (matchmakingTimeout.current) {
      clearTimeout(matchmakingTimeout.current)
      matchmakingTimeout.current = null
    }
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

        <section className="game-modes">
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
          >
            {isMatchmaking && (
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
            )}
          </ModeCard>
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
              <input type="text" value={roomId} placeholder="输入房间ID" onChange={(e) => setRoomId(e.target.value)} />
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

const ModeCard = ({ icon, title, description, actionLabel, onAction, children, actionDisabled }) => {
  return (
    <div className="mode-card">
      <div className="mode-icon">{icon}</div>
      <h3 className="mode-title">{title}</h3>
      <p className="mode-desc">{description}</p>
      <button type="button" className="mode-btn primary" onClick={onAction} disabled={actionDisabled}>
        {actionLabel}
      </button>
      {children}
    </div>
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

