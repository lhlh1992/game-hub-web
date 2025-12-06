import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '../styles/game.css'
import { useAuth } from '../hooks/useAuth.js'
import { useGomokuGame } from '../hooks/useGomokuGame.js'
import { useOngoingGame } from '../hooks/useOngoingGame.js'
import { getOngoingGame, leaveRoom } from '../services/api/gameApi.js'

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

const TURN_SECONDS = 30

const DEFAULT_SELF_PLAYER = {
  name: '玩家',
  avatar: DEFAULT_AVATAR,
  sideBadgeClass: 'side-black',
  sideText: 'Black',
  countdownText: '--',
  countdownClass: '',
  countdownProgress: 0,
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
  countdownProgress: 0,
  isWinner: false,
  isActive: false,
}

const GameRoomPage = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh: refreshOngoing } = useOngoingGame()
  // 当前用户唯一标识（用于在 readyStatus 中取准备状态）
  const currentUserId = user?.keycloakUserId || user?.id || user?.username || 'self'

  const [statusBar, setStatusBar] = useState(DEFAULT_STATUS)
  const [selfPlayer, setSelfPlayer] = useState(DEFAULT_SELF_PLAYER)
  // 使用函数初始化，确保每次都是新对象
  const [opponentPlayer, setOpponentPlayer] = useState(() => ({ ...DEFAULT_OPPONENT }))
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT_MESSAGES)
  const [forbiddenTipVisible, setForbiddenTipVisible] = useState(false)
  const [messageInfo, setMessageInfo] = useState({ show: false, text: '', type: 'error' })
  const showForbiddenTip = useCallback(() => {
    setForbiddenTipVisible(true)
    window.setTimeout(() => setForbiddenTipVisible(false), 2000)
  }, [])
  const showMessage = useCallback((text, type = 'error') => {
    setMessageInfo({ show: true, text, type })
    window.setTimeout(() => setMessageInfo({ show: false, text: '', type: 'error' }), 3000)
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
    readyStatus,
    roomPhase,
    mode,
    aiSide,
    seatXUserId,
    seatOUserId,
    seatXUserInfo,
    seatOUserInfo,
    seatXConnected,
    seatOConnected,
    placeStone,
    requestResign,
    requestRestart,
    toggleReady,
    requestStartGame,
  } = useGomokuGame({ roomId, onForbidden: showForbiddenTip, onMessage: showMessage })
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
  const [leaving, setLeaving] = useState(false)
  // 记录上一次的游戏状态，用于检测游戏结束的瞬间
  const prevGameStatusRef = useRef({ over: false, winner: null })
  // 标记是否是首次渲染（用于区分页面刷新和状态变化）
  const isFirstRenderRef = useRef(true)
  
  // 当房间ID变化时，重置首次渲染标记和游戏状态记录
  useEffect(() => {
    isFirstRenderRef.current = true
    prevGameStatusRef.current = { over: false, winner: null }
  }, [roomId])

  useEffect(() => {
    document.title = '五子棋 - 游戏进行中'
    // 页面加载或roomId变化时滚动到顶部
    window.scrollTo(0, 0)
  }, [roomId])

  useEffect(() => {
    if (!roomId) {
      return
    }
    refreshOngoing?.()
  }, [refreshOngoing, roomId])

  useEffect(() => {
    if (!roomId) {
      navigate('/lobby', { replace: true })
      return
    }
    let cancelled = false
    const validateAccess = async () => {
      try {
        const latest = await getOngoingGame()
        if (cancelled) {
          return
        }
        if (!latest?.hasOngoing || latest.roomId !== roomId) {
          window.alert('当前没有正在进行的对局，已返回大厅')
          navigate('/lobby', { replace: true })
        } else {
          await refreshOngoing?.()
        }
      } catch (error) {
        console.error('验证对局状态失败', error)
        window.alert('无法验证当前对局状态，已返回大厅')
        navigate('/lobby', { replace: true })
      }
    }
    validateAccess()
    return () => {
      cancelled = true
    }
  }, [navigate, refreshOngoing, roomId])

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
    // 如果 mySide 已设置，更新自己的玩家信息
    if (mySide) {
      setSelfPlayer((prev) => ({
        ...prev,
        sideBadgeClass: mySide === 'O' ? 'side-white' : 'side-black',
        sideText: mySide === 'O' ? 'White' : 'Black',
      }))
    }
    
    // 根据座位用户ID和模式确定对手信息
    // 即使 mySide 未设置，也可以根据 seatXUserId 和 seatOUserId 来确定对手
    // 如果 mySide 已设置，使用 mySide 来确定对手；否则，根据 currentUserId 来确定
    let opponentSide = null
    let opponentUserId = null
    
    if (mySide) {
      // mySide 已设置，直接根据 mySide 确定对手
      opponentSide = mySide === 'O' ? 'X' : 'O'
      opponentUserId = opponentSide === 'X' ? seatXUserId : seatOUserId
    } else {
      // mySide 未设置，根据 currentUserId 和 seatXUserId/seatOUserId 来确定对手
      // 如果 currentUserId 等于 seatXUserId，则对手是 seatOUserId；反之亦然
      if (currentUserId && seatXUserId && seatOUserId) {
        if (currentUserId === seatXUserId) {
          opponentUserId = seatOUserId
          opponentSide = 'O'
        } else if (currentUserId === seatOUserId) {
          opponentUserId = seatXUserId
          opponentSide = 'X'
        }
      } else if (currentUserId && seatXUserId && currentUserId === seatXUserId) {
        // 当前用户是黑棋，对手是白棋（如果存在）
        opponentUserId = seatOUserId
        opponentSide = 'O'
      } else if (currentUserId && seatOUserId && currentUserId === seatOUserId) {
        // 当前用户是白棋，对手是黑棋（如果存在）
        opponentUserId = seatXUserId
        opponentSide = 'X'
      } else if (seatXUserId && seatOUserId) {
        // 两个座位都有用户，但 currentUserId 不匹配，可能是数据还没同步；
        // 这种情况下，暂时无法确定对手，等待 mySide 设置
        return
      }
    }
    
    // 确定对手用户ID：根据我的座位，找到对手座位的用户ID
    // 注意：如果对手用户ID等于当前用户ID，说明可能是数据异常，不应该显示自己
    const isOpponentSelf = opponentUserId === currentUserId
    const shouldShowOpponent = opponentUserId && !isOpponentSelf && String(opponentUserId).trim() !== ''

    // 根据对手的落子方，拿到对应的用户信息对象（后端通过 FullSync 带过来的 UserProfileView）
    let opponentInfo = null
    if (opponentSide === 'X') {
      opponentInfo = seatXUserInfo || null
    } else if (opponentSide === 'O') {
      opponentInfo = seatOUserInfo || null
    } else if (!mySide) {
      // mySide 未知时，根据 currentUserId 反推：找“不是我”的那个用户信息
      const candX = seatXUserInfo
      const candO = seatOUserInfo
      if (candX && candX.userId && candX.userId !== currentUserId) {
        opponentInfo = candX
      } else if (candO && candO.userId && candO.userId !== currentUserId) {
        opponentInfo = candO
      }
    }

    // 确定显示的名字（优先昵称 -> 用户名 -> 截断的 userId）
    let opponentName = 'Waiting...'
    const normalizedMode = mode ? String(mode).toUpperCase() : null
    if (normalizedMode === 'PVE') {
      opponentName = 'AI Opponent'
    } else if (shouldShowOpponent) {
      if (opponentInfo) {
        const nick = opponentInfo.nickname && opponentInfo.nickname.trim()
        const uname = opponentInfo.username && opponentInfo.username.trim()
        opponentName =
          nick || uname || `玩家 ${String(opponentUserId).substring(0, 8)}...`
      } else {
        opponentName = `玩家 ${String(opponentUserId).substring(0, 8)}...`
      }
    }
    
    // 确定对手的 sideBadgeClass 和 sideText
    // 如果 opponentSide 已确定，使用它；否则根据 mySide 推断
    let opponentSideBadgeClass = 'side-white'
    let opponentSideText = 'White'
    if (opponentSide === 'X') {
      opponentSideBadgeClass = 'side-black'
      opponentSideText = 'Black'
    } else if (opponentSide === 'O') {
      opponentSideBadgeClass = 'side-white'
      opponentSideText = 'White'
    } else if (mySide) {
      // 如果 opponentSide 未确定但 mySide 已设置，根据 mySide 推断
      opponentSideBadgeClass = mySide === 'O' ? 'side-black' : 'side-white'
      opponentSideText = mySide === 'O' ? 'Black' : 'White'
    }
    
    setOpponentPlayer((prev) => ({
      // 确保总是创建新对象，避免引用问题
      ...prev,
      sideBadgeClass: opponentSideBadgeClass,
      sideText: opponentSideText,
      name: opponentName,
      avatar: prev.avatar || DEFAULT_AVATAR,
      countdownText: prev.countdownText || '--',
      countdownClass: prev.countdownClass || '',
      countdownProgress: prev.countdownProgress ?? 0,
      isWinner: prev.isWinner ?? false,
      isActive: prev.isActive ?? false,
    }))
  }, [mySide, mode, seatXUserId, seatOUserId, currentUserId, seatXUserInfo, seatOUserInfo])

  // 调试：监听 opponentPlayer 的变化（生产环境已不输出日志）
  useEffect(() => {}, [opponentPlayer])

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

  // 判断是否可以开始游戏
  const canStartGame = useCallback(() => {
    if (!readyStatus || Object.keys(readyStatus).length === 0) {
      return false
    }
    
    const isPveMode = mode === 'PVE'
    
    if (isPveMode) {
      // PVE模式：只需要房主（当前玩家）准备即可（AI默认已准备）
      return !!readyStatus[currentUserId]
    } else {
      // PVP模式：需要至少2个玩家，且所有玩家都准备
      // 检查座位占用情况：需要黑棋和白棋座位都有玩家
      const hasBlackPlayer = !!seatXUserId
      const hasWhitePlayer = !!seatOUserId
      
      if (!hasBlackPlayer || !hasWhitePlayer) {
        // 至少有一个座位没有玩家，不能开始
        return false
      }
      
      // 检查所有在房间内的玩家是否都已准备
      const playersInRoom = []
      if (seatXUserId) playersInRoom.push(seatXUserId)
      if (seatOUserId) playersInRoom.push(seatOUserId)
      
      // 所有玩家都必须准备
      return playersInRoom.every((playerId) => !!readyStatus[playerId])
    }
  }, [readyStatus, mode, currentUserId, seatXUserId, seatOUserId])

  // 计算自己与对手的准备状态，用于在左右两侧展示
  const selfReady = !!readyStatus?.[currentUserId]
  const { opponentReady, isPve } = useMemo(() => {
    // 根据真实的 mode 判断是否是 PVE
    const isPveMode = mode === 'PVE'
    
    if (!readyStatus) {
      return { opponentReady: false, isPve: isPveMode }
    }
    
    if (isPveMode) {
      // PVE 模式：AI 默认已准备
      return { opponentReady: true, isPve: true }
    }
    
    // PVP 模式：查找对手的准备状态
    const userIds = Object.keys(readyStatus)
    const opponentId = userIds.find((id) => id !== currentUserId)
    return {
      opponentReady: opponentId ? !!readyStatus[opponentId] : false,
      isPve: false,
    }
  }, [readyStatus, currentUserId, mode])

  const handleLeaveRoom = useCallback(async () => {
    if (leaving) {
      return
    }
    if (!window.confirm('确认离开当前房间并返回大厅吗？')) {
      return
    }
    setLeaving(true)
    try {
      await leaveRoom(roomId)
      await refreshOngoing?.()
    } catch (error) {
      console.error('离开房间失败', error)
      window.alert('离开房间失败，请稍后再试')
    } finally {
      setLeaving(false)
      navigate('/lobby')
    }
  }, [leaving, navigate, refreshOngoing, roomId])

  const closeVictoryModal = useCallback(() => {
    setVictoryInfo((prev) => ({ ...prev, show: false }))
  }, [])

  useEffect(() => {
    const prevOver = prevGameStatusRef.current.over
    const prevWinner = prevGameStatusRef.current.winner
    const currentOver = gameStatus.over
    const currentWinner = gameStatus.winner
    const isFirstRender = isFirstRenderRef.current

    // 检测游戏状态从"未结束"变成"已结束"的瞬间
    // 排除首次渲染时游戏已经结束的情况（页面刷新）
    const justFinished = !isFirstRender && !prevOver && currentOver && currentWinner

    // 更新上一次的状态
    prevGameStatusRef.current = { over: currentOver, winner: currentWinner }
    // 首次渲染后，标记为非首次
    if (isFirstRender) {
      isFirstRenderRef.current = false
    }

    // 如果游戏刚结束（状态变化），显示弹出框
    if (justFinished) {
      const winnerSide = currentWinner === 'O' ? 'white' : 'black'
      const winnerIsSelf = mySide && mySide.toUpperCase() === currentWinner.toUpperCase()
      setVictoryInfo({
        show: true,
        winnerName: winnerIsSelf ? selfPlayer.name : opponentPlayer.name,
        side: winnerSide,
      })
    } else if (!currentOver || !currentWinner) {
      // 如果游戏未结束，隐藏弹出框
      setVictoryInfo((prev) => ({ ...prev, show: false }))
    }
    // 如果游戏已经结束但不是刚结束的瞬间（包括首次渲染时已结束），不显示弹出框
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
        countdownProgress: 0,
      }))
    }
    const applyCountdownTo = (setter, seconds) => {
      const normalizedSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
      const ratio = Math.max(0, Math.min(1, normalizedSeconds / TURN_SECONDS))
      setter((prev) => ({
        ...prev,
        countdownText: formatSeconds(normalizedSeconds),
        countdownClass: classFromSeconds(seconds),
        countdownProgress: ratio,
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
          <PlayerCard
            idPrefix="self"
            player={selfPlayer}
            wsConnected={wsConnected}
            readyLabel={selfReady ? '已准备' : '未准备'}
            readyAccent={selfReady}
            readyButtonLabel={roomPhase !== 'PLAYING' ? (selfReady ? '取消准备' : '准备') : null}
            onToggleReady={roomPhase !== 'PLAYING' ? toggleReady : null}
          />
          <GameChatPanel messages={chatHistory} onSend={handleSendChat} />
          <div className="leave-room-panel">
            <span className="leave-arrow" aria-hidden="true">
              ←
            </span>
            <button type="button" className="leave-room-btn" onClick={handleLeaveRoom} disabled={leaving}>
              Leave Room
            </button>
          </div>
        </div>

        <div className="game-center-panel">
          {/* 开始游戏：居中放在棋盘上方，始终显示，根据状态禁用 */}
          <div
            className="start-game-bar"
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <button
              type="button"
              className="btn-action btn-start"
              onClick={requestStartGame}
              disabled={!wsConnected || roomPhase !== 'WAITING' || !canStartGame()}
            >
              开始游戏
            </button>
          </div>

          <div className="board-container">
            <GomokuBoard grid={board} lastMove={lastMove} winLines={winLines} onCellClick={placeStone} />
            <div className="board-reflection-left" />
            <div className="board-reflection-right" />
          </div>
          <div className="game-actions">
            {/* 对局中的操作按钮区域：仅在 PLAYING 时显示认输按钮；不再提供本地“再来一局”按钮 */}
            {roomPhase === 'PLAYING' && (
              <button type="button" className="btn-action btn-resign" id="btnResign" onClick={handleResign}>
                Resign
              </button>
            )}
          </div>
        </div>

        <div className="player-panel player-right">
          <PlayerCard
            idPrefix="opponent"
            player={opponentPlayer}
            wsConnected={(() => {
              // 根据对手的side判断连接状态
              // 如果对手是黑棋（X），使用seatXConnected；如果是白棋（O），使用seatOConnected
              if (mode === 'PVE') {
                // PVE模式：AI始终在线
                return true
              }
              if (mySide === 'X') {
                // 我是黑棋，对手是白棋
                return seatOConnected
              } else if (mySide === 'O') {
                // 我是白棋，对手是黑棋
                return seatXConnected
              }
              // 如果mySide未设置，根据座位信息推断
              if (currentUserId === seatXUserId) {
                // 我是黑棋
                return seatOConnected
              } else if (currentUserId === seatOUserId) {
                // 我是白棋
                return seatXConnected
              }
              // 默认返回false
              return false
            })()}
            readyLabel={
              isPve
                ? 'AI 已准备'
                : opponentPlayer.name === 'Waiting...'
                  ? '等待玩家加入'
                  : `对手 ${opponentReady ? '已准备' : '未准备'}`
            }
            readyAccent={isPve || opponentReady}
          />
          <SystemInfoPanel messages={systemMessages} />
        </div>
      </main>

      <ForbiddenTip visible={forbiddenTipVisible} />
      <VictoryModal info={victoryInfo} onClose={closeVictoryModal} />
      <MessageToast info={messageInfo} onClose={() => setMessageInfo({ show: false, text: '', type: 'error' })} />
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

const PlayerCard = ({
  idPrefix,
  player,
  wsConnected = false,
  readyLabel,
  readyAccent = false,
  readyButtonLabel,
  onToggleReady,
}) => {
  // 调试逻辑已移除，避免在控制台刷屏
  useEffect(() => {}, [idPrefix, player])
  
  const progress = Math.max(0, Math.min(1, player.countdownProgress ?? 0))
  const dashArray = 283
  const dashOffset = dashArray * (1 - progress)
  const showCountdown = progress > 0

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
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
                transform="rotate(-90 50 50)"
              style={{ opacity: showCountdown ? 1 : 0 }}
              />
            </svg>
          </div>
          <div className="player-side-text" id={`${idPrefix}SideText`}>
            {player.sideText}
          </div>
        <div className={`player-countdown-number ${showCountdown ? 'show' : ''}`} id={`${idPrefix}Countdown`}>
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
      {(readyLabel || readyButtonLabel) && (
        <div
          className="player-ready-row"
          style={{
            marginTop: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {readyLabel && (
            <span
              className={`ready-badge ${readyAccent ? 'on' : 'off'}`}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                background: readyAccent ? 'rgba(16,185,129,0.08)' : 'rgba(148,163,184,0.12)',
                color: readyAccent ? '#059669' : '#64748b',
                border: `1px solid ${readyAccent ? 'rgba(16,185,129,0.4)' : 'rgba(148,163,184,0.5)'}`,
                whiteSpace: 'nowrap',
              }}
            >
              {readyLabel}
            </span>
          )}
          {readyButtonLabel && onToggleReady && (
            <button
              type="button"
              className="btn-action btn-ready"
              onClick={onToggleReady}
              style={{ paddingInline: '14px', fontSize: '12px' }}
            >
              {readyButtonLabel}
            </button>
          )}
        </div>
      )}
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

const MessageToast = ({ info, onClose }) => {
  if (!info.show) return null
  return (
    <div className={`message-toast ${info.show ? 'show' : ''}`} onClick={onClose}>
      <div className={`message-toast-content ${info.type}`}>
        <span className="message-toast-icon">
          {info.type === 'error' ? '⚠️' : 'ℹ️'}
        </span>
        <span className="message-toast-text">{info.text}</span>
      </div>
    </div>
  )
}

const WIN_DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value).trim()
  if (!text || text === '.') {
    return null
  }
  const upper = text.toUpperCase()
  if (upper === 'X' || upper === 'BLACK' || upper === 'B' || upper === '0') {
    return 'X'
  }
  if (upper === 'O' || upper === 'WHITE' || upper === 'W' || upper === '1') {
    return 'O'
  }
  return null
}

const detectWinCellsFromGrid = (grid) => {
  if (!Array.isArray(grid) || !grid.length) {
    return null
  }
  const size = grid.length
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const piece = normalizeCellValue(grid?.[x]?.[y])
      if (!piece) continue
      for (let i = 0; i < WIN_DIRS.length; i += 1) {
        const [dx, dy] = WIN_DIRS[i]
        const prevX = x - dx
        const prevY = y - dy
        if (
          prevX >= 0 &&
          prevX < size &&
          prevY >= 0 &&
          prevY < size &&
          normalizeCellValue(grid?.[prevX]?.[prevY]) === piece
        ) {
          continue
        }
        const coords = []
        let cx = x
        let cy = y
        while (
          cx >= 0 &&
          cx < size &&
          cy >= 0 &&
          cy < size &&
          normalizeCellValue(grid?.[cx]?.[cy]) === piece
        ) {
          coords.push([cx, cy])
          cx += dx
          cy += dy
        }
        if (coords.length >= 5) {
          const result = coords.slice(0, 5)
          return result
        }
      }
    }
  }
  return null
}

const GomokuBoard = ({ grid, lastMove, winLines, onCellClick }) => {
  const effectiveWinSet = useMemo(() => {
    if (winLines && winLines.size >= 5) {
      return winLines
    }
    const detected = detectWinCellsFromGrid(grid)
    if (!detected) {
      return null
    }
    const result = new Set(detected.map(([x, y]) => `${x},${y}`))
    return result
  }, [grid, winLines])

  const winningLinePoints = useMemo(() => {
    if (!effectiveWinSet || effectiveWinSet.size < 2) {
      return null
    }
    const coords = Array.from(effectiveWinSet)
      .map((key) => key.split(',').map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .map(([x, y]) => ({ x, y }))

    if (coords.length < 2) {
      return null
    }

    const sameRow = coords.every((pt) => pt.x === coords[0].x)
    const sameCol = coords.every((pt) => pt.y === coords[0].y)
    const sameDiagDown = coords.every((pt) => pt.x - pt.y === coords[0].x - coords[0].y)
    const sameDiagUp = coords.every((pt) => pt.x + pt.y === coords[0].x + coords[0].y)

    let sorted = coords
    if (sameRow) {
      sorted = [...coords].sort((a, b) => a.y - b.y)
    } else if (sameCol) {
      sorted = [...coords].sort((a, b) => a.x - b.x)
    } else if (sameDiagDown || sameDiagUp) {
      sorted = [...coords].sort((a, b) => a.x - b.x)
    } else {
      sorted = [...coords].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
    }

    const toBoardPoint = ({ x, y }) => ({
      cx: BOARD_GRID_ORIGIN + y * CELL_SIZE,
      cy: BOARD_GRID_ORIGIN + x * CELL_SIZE,
    })

    const result = {
      start: toBoardPoint(sorted[0]),
      end: toBoardPoint(sorted[sorted.length - 1]),
    }
    return result
  }, [effectiveWinSet])

  const cells = useMemo(() => {
    const list = []
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        const value = grid?.[x]?.[y]
        const classList = ['cell']

        const isLast = lastMove && lastMove.x === x && lastMove.y === y
        const winKey = `${x},${y}`
        const isWinning = effectiveWinSet?.has?.(winKey)

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
  }, [grid, lastMove, effectiveWinSet, onCellClick])

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
      <div id="board" style={{ width: '100%', height: '100%', position: 'relative' }}>
        {winningLinePoints ? (
          <svg
            className="win-line-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 15,
            }}
          >
            <line
              x1={winningLinePoints.start.cx}
              y1={winningLinePoints.start.cy}
              x2={winningLinePoints.end.cx}
              y2={winningLinePoints.end.cy}
              stroke="#FF0000"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.9"
            />
          </svg>
        ) : null}
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

