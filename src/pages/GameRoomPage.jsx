import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import '../styles/game.css'
import { useAuth } from '../hooks/useAuth.js'

const DEFAULT_AVATAR = '/game-service/images/avatar-default.png'

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
}

const DEFAULT_OPPONENT = {
  name: 'Waiting...',
  avatar: DEFAULT_AVATAR,
  sideBadgeClass: 'side-white',
  sideText: 'White',
  countdownText: '--',
  countdownClass: '',
  isWinner: false,
}

const GameRoomPage = () => {
  const { roomId } = useParams()
  const { user } = useAuth()

  const [statusBar, setStatusBar] = useState(DEFAULT_STATUS)
  const [selfPlayer, setSelfPlayer] = useState(DEFAULT_SELF_PLAYER)
  const [opponentPlayer] = useState(DEFAULT_OPPONENT)
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT_MESSAGES)
  const systemBootstrapMessages = useMemo(() => {
    if (!roomId) {
      return INITIAL_SYSTEM_MESSAGES
    }
    return [
      ...INITIAL_SYSTEM_MESSAGES,
      { id: 'sys-room', text: `Room ID: ${roomId}` },
    ]
  }, [roomId])
  const [systemMessages] = useState(systemBootstrapMessages)
  const [forbiddenTipVisible, setForbiddenTipVisible] = useState(false)
  const [victoryInfo, setVictoryInfo] = useState({ show: false, winnerName: '-', side: 'black' })

  useEffect(() => {
    document.title = '五子棋 - 游戏进行中'
  }, [])

  useEffect(() => {
    if (!user) return
    setSelfPlayer((prev) => ({
      ...prev,
      name: user.nickname?.trim() || user.username || prev.name,
      avatar: user.avatarUrl?.trim() || DEFAULT_AVATAR,
    }))
  }, [user])

  useEffect(() => {
    setStatusBar((prev) => ({
      ...prev,
      turnText: `${prev.current} to play`,
    }))
  }, [])

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
    window.alert('认输逻辑将连接后端接口（TODO）')
  }, [])

  const handleRestart = useCallback(() => {
    window.alert('重新开局逻辑将连接后端接口（TODO）')
  }, [])

  const closeVictoryModal = useCallback(() => {
    setVictoryInfo((prev) => ({ ...prev, show: false }))
  }, [])

  const showForbiddenTip = useCallback(() => {
    setForbiddenTipVisible(true)
    window.setTimeout(() => setForbiddenTipVisible(false), 2000)
  }, [])

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
          <PlayerCard idPrefix="self" player={selfPlayer} />
          <GameChatPanel messages={chatMessages} onSend={handleSendChat} />
        </div>

        <div className="game-center-panel">
          <div className="board-container">
            <div id="board" aria-label="Board" />
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
          <PlayerCard idPrefix="opponent" player={opponentPlayer} />
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

const PlayerCard = ({ idPrefix, player }) => {
  return (
    <div className="player-card">
      <div className="player-status-dot" id={`${idPrefix}StatusDot`} />
      <div className="player-avatar-stone-row">
        <div className="player-avatar-wrapper">
          <div className="player-avatar">
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

export default GameRoomPage

