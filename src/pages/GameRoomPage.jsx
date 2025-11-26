import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import '../styles/game.css'
import { useAuth } from '../hooks/useAuth.js'
import { useGomokuGame } from '../hooks/useGomokuGame.js'

const BOARD_SIZE = 15
const CELL_SIZE = 42
const CELL_VISUAL = CELL_SIZE * 0.8
const BOARD_PADDING = 44
const GRID_LINE_HALF = 0.75
const BOARD_GRID_ORIGIN = BOARD_PADDING - GRID_LINE_HALF
const BOARD_LAST_INDEX = BOARD_SIZE - 1
const BOARD_DIMENSION = CELL_SIZE * (BOARD_SIZE - 1) + CELL_SIZE * 0.4 + BOARD_PADDING * 2
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']
const STAR_POINTS = [
  { x: 7, y: 7, isTengen: true },
  { x: 3, y: 3 },
  { x: 3, y: 11 },
  { x: 11, y: 3 },
  { x: 11, y: 11 },
]

const DEFAULT_AVATAR = '/images/avatar-default.png'

const INITIAL_CHAT_MESSAGES = [
  { id: 'msg-1', type: 'player1', text: 'Player1: Good luck!' },
  { id: 'msg-2', type: 'player2', text: 'Player2: Thanks, you too!' },
  { id: 'msg-3', type: 'player1', text: 'Player1: Nice move!' },
  { id: 'msg-4', type: 'player2', text: "Player2: Let's see what happens" },
  { id: 'msg-5', type: 'system', text: 'System: Game started' },
]

const INITIAL_SYSTEM_MESSAGES = [
  { id: 'sys-1', text: 'Game started' },
  { id: 'sys-2', text: 'Player1 joined' },
  { id: 'sys-3', text: 'Player2 joined' },
  { id: 'sys-4', text: "Player1's turn" },
  { id: 'sys-5', text: "Player2's turn" },
]

const DEFAULT_STATUS = {
  round: 1,
  current: 'Black',
  turnText: 'Black to play',
  timer: '--',
  gameStatus: 'Playing',
  score: '0:0',
}

const DEFAULT_SELF_PLAYER = {
  name: '玩家',
  avatar: DEFAULT_AVATAR,
  sideBadgeClass: 'side-black',
  sideText: 'Black',
  countdownText: '--',
  countdownClass: '',
  isWinner: false,
  isActive: false,
}

const DEFAULT_OPPONENT = {
  name: 'Waiting...',
  avatar: DEFAULT_AVATAR,
  sideBadgeClass: 'side-white',
  sideText: 'White',
  countdownText: '--',
  countdownClass: '',
  isWinner: false,
  isActive: false,
}

const GameRoomPage = () => {
  const { roomId } = useParams()
  const { user } = useAuth()

  const [statusBar, setStatusBar] = useState(DEFAULT_STATUS)
  const [selfPlayer, setSelfPlayer] = useState(DEFAULT_SELF_PLAYER)
  const [opponentPlayer, setOpponentPlayer] = useState(DEFAULT_OPPONENT)
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT_MESSAGES)
  const [forbiddenTipVisible, setForbiddenTipVisible] = useState(false)
  const showForbiddenTip = useCallback(() => {
    setForbiddenTipVisible(true)
    window.setTimeout(() => setForbiddenTipVisible(false), 2000)
  }, [])
  const {
    board,
    lastMove,
    winLines,
    sideToMove,
    roundInfo,
    scoreInfo,
    gameStatus,
    mySide,
    countdown,
    systemLogs,
    chatMessages: liveChatMessages,
    wsConnected,
    placeStone,
    requestResign,
    requestRestart,
  } = useGomokuGame({ roomId, onForbidden: showForbiddenTip })
  const systemBootstrapMessages = useMemo(() => {
    if (!roomId) {
      return INITIAL_SYSTEM_MESSAGES
    }
    return [
      ...INITIAL_SYSTEM_MESSAGES,
      { id: 'sys-room', text: `Room ID: ${roomId}` },
    ]
  }, [roomId])
  const [systemMessages, setSystemMessages] = useState(systemBootstrapMessages)
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT_MESSAGES)
  const [victoryInfo, setVictoryInfo] = useState({ show: false, winnerName: '-', side: 'black' })

  useEffect(() => {
    document.title = '五子棋 - 游戏进行中'
  }, [])

  useEffect(() => {
    if (systemLogs?.length) {
      setSystemMessages((prev) => [...prev, ...systemLogs])
    }
  }, [systemLogs])

  useEffect(() => {
    if (liveChatMessages?.length) {
      setChatHistory((prev) => [...prev, ...liveChatMessages])
    }
  }, [liveChatMessages])

  useEffect(() => {
    if (!user) return
    setSelfPlayer((prev) => ({
      ...prev,
      name: user.nickname?.trim() || user.username || prev.name,
      avatar: user.avatarUrl?.trim() || DEFAULT_AVATAR,
    }))
  }, [user])

  useEffect(() => {
    if (!mySide) {
      return
    }
    setSelfPlayer((prev) => ({
      ...prev,
      sideBadgeClass: mySide === 'O' ? 'side-white' : 'side-black',
      sideText: mySide === 'O' ? 'White' : 'Black',
    }))
    setOpponentPlayer((prev) => ({
      ...prev,
      sideBadgeClass: mySide === 'O' ? 'side-black' : 'side-white',
      sideText: mySide === 'O' ? 'Black' : 'White',
      name: prev.name === 'Waiting...' && mySide === 'PVE' ? 'AI Opponent' : prev.name,
    }))
  }, [mySide])

  useEffect(() => {
    setStatusBar((prev) => ({
      ...prev,
      turnText: sideToMove === 'O' ? 'White to play' : 'Black to play',
      current: sideToMove === 'O' ? 'White' : 'Black',
      round: roundInfo?.round ?? prev.round,
      score: `${scoreInfo?.black ?? 0}:${scoreInfo?.white ?? 0}`,
      gameStatus: gameStatus?.label ?? prev.gameStatus,
    }))
    setSelfPlayer((prev) => ({ ...prev, isActive: sideToMove !== 'O' }))
    setOpponentPlayer((prev) => ({ ...prev, isActive: sideToMove === 'O' }))
  }, [gameStatus, roundInfo, scoreInfo, sideToMove])

  const handleSendChat = useCallback(
    (text) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      const messageType = selfPlayer.sideBadgeClass === 'side-black' ? 'player1' : 'player2'
      const displayName = selfPlayer.name || 'Player'
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto?.randomUUID?.() || String(Date.now()),
          type: messageType,
          text: `${displayName}: ${trimmed}`,
        },
      ])
    },
    [selfPlayer],
  )

  const handleResign = useCallback(() => {
    if (!window.confirm('确定要认输吗？')) {
      return
    }
    requestResign()
  }, [requestResign])

  const handleRestart = useCallback(() => {
    if (!window.confirm('确定要重新开始吗？')) {
      return
    }
    requestRestart()
  }, [requestRestart])

  const closeVictoryModal = useCallback(() => {
    setVictoryInfo((prev) => ({ ...prev, show: false }))
  }, [])

  useEffect(() => {
    if (!gameStatus.over || !gameStatus.winner) {
      setVictoryInfo((prev) => ({ ...prev, show: false }))
      return
    }
    const winnerSide = gameStatus.winner === 'O' ? 'white' : 'black'
    const winnerIsSelf = mySide && mySide.toUpperCase() === gameStatus.winner.toUpperCase()
    setVictoryInfo({
      show: true,
      winnerName: winnerIsSelf ? selfPlayer.name : opponentPlayer.name,
      side: winnerSide,
    })
  }, [gameStatus, mySide, opponentPlayer.name, selfPlayer.name])

  useEffect(() => {
    const formatSeconds = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--'
      }
      return `${seconds}s`
    }
    const classFromSeconds = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return ''
      }
      if (seconds <= 5) {
        return 'danger'
      }
      if (seconds <= 10) {
        return 'warning'
      }
      return 'normal'
    }
    const resetPlayerCountdown = (setter) => {
      setter((prev) => ({
        ...prev,
        countdownText: '--',
        countdownClass: '',
      }))
    }
    const applyCountdownTo = (setter, seconds) => {
      setter((prev) => ({
        ...prev,
        countdownText: formatSeconds(seconds),
        countdownClass: classFromSeconds(seconds),
      }))
    }

    if (!countdown?.side) {
      resetPlayerCountdown(setSelfPlayer)
      resetPlayerCountdown(setOpponentPlayer)
      return
    }

    const normalizedSide = countdown.side.toUpperCase()
    const isSelf =
      mySide?.toUpperCase() === normalizedSide ||
      (!mySide && ((normalizedSide === 'X' && selfPlayer.sideText === 'Black') || (normalizedSide === 'O' && selfPlayer.sideText === 'White')))

    if (isSelf) {
      applyCountdownTo(setSelfPlayer, countdown.seconds)
      resetPlayerCountdown(setOpponentPlayer)
    } else {
      applyCountdownTo(setOpponentPlayer, countdown.seconds)
      resetPlayerCountdown(setSelfPlayer)
    }
  }, [countdown, mySide, selfPlayer.sideText])

  const statusCapsules = useMemo(
    () => [
      { label: 'Round', value: statusBar.round, valueId: 'roundInfo' },
      { label: 'Current', value: statusBar.current, valueId: 'currentPlayer' },
    ],
    [statusBar],
  )

  return (
    <div className="game-room">
      <main className="game-layout">
        <GameStatusBar status={statusBar} capsules={statusCapsules} onForbiddenTip={showForbiddenTip} />

        <div className="player-panel player-left">
          <PlayerCard idPrefix="self" player={selfPlayer} wsConnected={wsConnected} />
          <GameChatPanel messages={chatHistory} onSend={handleSendChat} />
        </div>

        <div className="game-center-panel">
          <div className="board-container">
            <GomokuBoard grid={board} lastMove={lastMove} winLines={winLines} onCellClick={placeStone} />
            <div className="board-reflection-left" />
            <div className="board-reflection-right" />
          </div>
          <div className="game-actions">
            <button type="button" className="btn-action btn-resign" id="btnResign" onClick={handleResign}>
              Resign
            </button>
            <button type="button" className="btn-action btn-restart" id="btnRestart" onClick={handleRestart}>
              New Game
            </button>
          </div>
        </div>

        <div className="player-panel player-right">
          <PlayerCard idPrefix="opponent" player={opponentPlayer} wsConnected={wsConnected} />
          <SystemInfoPanel messages={systemMessages} />
        </div>
      </main>

      <ForbiddenTip visible={forbiddenTipVisible} />
      <VictoryModal info={victoryInfo} onClose={closeVictoryModal} />
    </div>
  )
}

const GameStatusBar = ({ status, capsules, onForbiddenTip }) => {
  return (
    <div className="game-status-bar">
      {capsules.map((capsule) => (
        <StatusCapsule key={capsule.label} label={capsule.label} value={capsule.value} valueId={capsule.valueId} />
      ))}
      <StatusCapsule custom>
        <div className="status-capsule turn-indicator">
          <span className="turn-indicator-text" id="turnIndicator">
            {status.turnText}
          </span>
        </div>
      </StatusCapsule>
      <StatusCapsule label="Black" value={<span className="info-value side-indicator side-black-indicator">●</span>} />
      <StatusCapsule label="White" value={<span className="info-value side-indicator side-white-indicator">○</span>} />
      <StatusCapsule custom>
        <div className="status-capsule timer-capsule">
          <span className="timer-icon">⏱</span>
          <span className="info-value" id="timer">
            {status.timer}
          </span>
        </div>
      </StatusCapsule>
      <StatusCapsule
        label="Status"
        value={status.gameStatus}
        valueId="gameStatus"
        capsuleId="gameStatusCapsule"
        onDoubleClick={onForbiddenTip}
      />
      <StatusCapsule label="Score" value={status.score} valueId="scoreInfo" className="score-capsule" />
    </div>
  )
}

const StatusCapsule = ({
  label,
  value,
  valueId,
  className = '',
  custom = false,
  capsuleId,
  onClick,
  onDoubleClick,
}) => {
  if (custom) {
    return value
  }
  return (
    <div
      className={`status-capsule ${className}`}
      id={capsuleId}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role={onClick || onDoubleClick ? 'button' : undefined}
      tabIndex={onClick || onDoubleClick ? 0 : undefined}
    >
      <span className="info-label">{label}</span>
      {typeof value === 'string' ? (
        <span className="info-value" id={valueId}>
          {value}
        </span>
      ) : (
        value
      )}
    </div>
  )
}

const PlayerCard = ({ idPrefix, player, wsConnected = false }) => {
  return (
    <div className="player-card">
      <div className={`player-status-dot ${wsConnected ? 'connected' : 'disconnected'}`} id={`${idPrefix}StatusDot`} />
      <div className="player-avatar-stone-row">
        <div className="player-avatar-wrapper">
          <div className={`player-avatar ${player.isActive ? 'active-turn' : ''}`}>
            <img id={`${idPrefix}Avatar`} src={player.avatar} alt="Avatar" />
            <div className="avatar-glow-ring" />
          </div>
          <div className="player-name" id={`${idPrefix}Name`}>
            {player.name}
          </div>
        </div>
        <div className="player-stone-wrapper">
          <div className="player-side-icon" id={`${idPrefix}Side`}>
            <span className={`side-icon ${player.sideBadgeClass}`} id={`${idPrefix}SideBadge`} />
            <svg className="countdown-progress-ring" id={`${idPrefix}CountdownRing`} viewBox="0 0 100 100">
              <circle className="countdown-progress-bg" cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 0, 0, 0.1)" strokeWidth="2" />
              <circle
                className={`countdown-progress-bar ${player.countdownClass}`}
                id={`${idPrefix}CountdownProgress`}
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="283"
                strokeDashoffset="283"
                transform="rotate(-90 50 50)"
              />
            </svg>
          </div>
          <div className="player-side-text" id={`${idPrefix}SideText`}>
            {player.sideText}
          </div>
          <div className="player-countdown-number show" id={`${idPrefix}Countdown`}>
            <span className={`countdown-text ${player.countdownClass}`} id={`${idPrefix}CountdownText`}>
              {player.countdownText}
            </span>
          </div>
        </div>
      </div>
      <div className="player-status-area">
        <div className={`player-winner-label ${player.isWinner ? 'show' : ''}`} id={`${idPrefix}Winner`}>
          Winner
        </div>
      </div>
    </div>
  )
}

const GameChatPanel = ({ messages, onSend }) => {
  const [input, setInput] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    onSend(input)
    setInput('')
  }, [input, onSend])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="game-chat-panel">
      <div className="game-chat-header">
        <span className="game-chat-title">GAME CHAT</span>
      </div>
      <div className="game-chat-messages" id="gameChatMessages">
        {messages.map((msg) => (
          <div key={msg.id} className={`game-chat-message ${msg.type}`}>
            {msg.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="game-chat-input-area">
        <input
          type="text"
          className="game-chat-input"
          id="gameChatInput"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="game-chat-send" id="gameChatSend" onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  )
}

const SystemInfoPanel = ({ messages }) => {
  return (
    <div className="system-info-panel">
      <div className="system-info-header">
        <span className="system-info-title">GAME LOG</span>
      </div>
      <div className="system-info-messages" id="systemInfoMessages">
        {messages.map((msg) => (
          <div key={msg.id} className="system-info-message">
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  )
}

const ForbiddenTip = ({ visible }) => {
  return (
    <div id="forbiddenTip" className={`forbidden-tip ${visible ? 'show' : ''}`}>
      <div className="forbidden-tip-content">
        <span className="forbidden-tip-icon">⚠️</span>
        <span className="forbidden-tip-text">禁手</span>
      </div>
    </div>
  )
}

const VictoryModal = ({ info, onClose }) => {
  const sideText = info.side === 'white' ? 'White' : 'Black'
  return (
    <div id="victoryModal" className={`victory-modal ${info.show ? 'show' : ''}`} onClick={onClose}>
      <div className="victory-modal-content">
        <div className="victory-icon">🎉</div>
        <div className="victory-title">Victory!</div>
        <div className="victory-winner">
          <span className="victory-winner-name" id="victoryWinnerName">
            {info.winnerName}
          </span>
        </div>
        <div className="victory-side">
          <span className={`victory-side-badge ${info.side}`} id="victorySideBadge" />
          <span className="victory-side-text" id="victorySideText">
            {sideText}
          </span>
        </div>
      </div>
    </div>
  )
}

const GomokuBoard = ({ grid, lastMove, winLines, onCellClick }) => {
  const cells = useMemo(() => {
    const list = []
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        const value = grid?.[x]?.[y]
        const classList = ['cell']
        
        // 先计算这些变量，再使用
        const isLast = lastMove && lastMove.x === x && lastMove.y === y
        const winKey = `${x},${y}`
        const isWinning = winLines?.has?.(winKey)
        
        if (value === 'X' || value === 'x') {
          classList.push('X')
        } else if (value === 'O' || value === 'o') {
          classList.push('O')
        }
        if (isLast) {
          classList.push('last')
        }
        if (isWinning) {
          classList.push('win-flash')
        }
        const centerX = BOARD_GRID_ORIGIN + y * CELL_SIZE
        const centerY = BOARD_GRID_ORIGIN + x * CELL_SIZE
        list.push(
          <div
            key={`cell-${x}-${y}`}
            className={classList.join(' ')}
            style={{
              left: `${centerX - CELL_VISUAL / 2}px`,
              top: `${centerY - CELL_VISUAL / 2}px`,
            }}
            data-x={x}
            data-y={y}
            title={`(${LETTERS[y]}${BOARD_SIZE - x})`}
            onClick={onCellClick}
          />,
        )
      }
    }
    return list
  }, [grid])

  const starNodes = useMemo(() => {
    return STAR_POINTS.map((star) => {
      const centerX = BOARD_GRID_ORIGIN + star.y * CELL_SIZE
      const centerY = BOARD_GRID_ORIGIN + star.x * CELL_SIZE
      return (
        <div
          key={`star-${star.x}-${star.y}`}
          className={`star-point${star.isTengen ? ' tengen' : ''}`}
          style={{ left: `${centerX}px`, top: `${centerY}px`, transform: 'translate(-50%, -50%)' }}
        />
      )
    })
  }, [])

  const coordY = useMemo(() => {
    const labels = []
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const pointY = BOARD_GRID_ORIGIN + x * CELL_SIZE
      labels.push(
        <div
          key={`coord-y-${x}`}
          className="board-coord coord-y"
          style={{
            left: `${BOARD_GRID_ORIGIN - 20}px`,
            top: `${pointY}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {BOARD_SIZE - x}
        </div>,
      )
    }
    return labels
  }, [])

  const coordX = useMemo(() => {
    const labels = []
    const baseY = BOARD_GRID_ORIGIN + BOARD_LAST_INDEX * CELL_SIZE + 20
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      const pointX = BOARD_GRID_ORIGIN + y * CELL_SIZE
      labels.push(
        <div
          key={`coord-x-${y}`}
          className="board-coord coord-x"
          style={{
            left: `${pointX}px`,
            top: `${baseY}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {LETTERS[y]}
        </div>,
      )
    }
    return labels
  }, [])

  return (
    <div
      className="board-surface"
      style={{ width: `${BOARD_DIMENSION}px`, height: `${BOARD_DIMENSION}px` }}
    >
      <div id="board" style={{ width: '100%', height: '100%' }}>
        {cells}
        {starNodes}
        {coordY}
        {coordX}
      </div>
    </div>
  )
}

function makeEmptyGrid(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill('.'))
}

export default GameRoomPage

