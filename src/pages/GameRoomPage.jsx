import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '../styles/game.css'
import { useAuth } from '../hooks/useAuth.js'
import { useGomokuGame } from '../hooks/useGomokuGame.js'
import { useOngoingGame } from '../hooks/useOngoingGame.js'
import { getOngoingGame, leaveRoom, getUserInfo, getRoomView } from '../services/api/gameApi.js'
import { getRoomChatHistory } from '../services/api/chatApi.js'
import { sendKick } from '../services/ws/gomokuSocket.js'
import { useChatRoomWs } from '../hooks/useChatRoomWs.js'
import { ROOM_MESSAGES } from '../i18n/index.js'

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

const INITIAL_CHAT_MESSAGES = []

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

// 为头像 URL 添加一次性 cache-bust，避免浏览器缓存旧头像
const withCacheBust = (url, version) => {
  if (!url) return url
  const v = version || Date.now()
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_=${v}`
}

// 将历史消息映射为前端展示格式
const mapHistoryMessage = (msg, currentUserId, resolveDisplayName) => {
  if (!msg) return null
  const { senderId, senderName, content, timestamp } = msg
  const isSelf = senderId && String(senderId) === String(currentUserId)
  const type = isSelf ? 'player1' : 'player2'
  const displayName = resolveDisplayName(senderId, senderName)
  return {
    id: `hist-${timestamp || Date.now()}-${senderId || Math.random()}`,
    type,
    senderId: senderId ? String(senderId) : undefined,
    senderName: displayName,
    contentRaw: content || '',
    text: `${displayName}: ${content || ''}`,
    timestamp,
  }
}

const GameRoomPage = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh: refreshOngoing } = useOngoingGame()
  // 当前用户唯一标识（用于在 readyStatus 中取准备状态）
  // 与后端保持一致：优先 userId（Keycloak sub），再回退 systemUserId，最后兜底 self
  const currentUserId = user?.userId || user?.systemUserId || 'self'

  const [statusBar, setStatusBar] = useState(DEFAULT_STATUS)
  const [selfPlayer, setSelfPlayer] = useState(DEFAULT_SELF_PLAYER)
  // 使用函数初始化，确保每次都是新对象
  const [opponentPlayer, setOpponentPlayer] = useState(() => ({ ...DEFAULT_OPPONENT }))
  // 本地缓存房间内涉及的用户档案（包含昵称/头像等），优先用于聊天显示
  const [userInfoCache, setUserInfoCache] = useState({})
  const pendingUserFetch = useRef(new Set())
  const [forbiddenTipVisible, setForbiddenTipVisible] = useState(false)
  const [messageInfo, setMessageInfo] = useState({ show: false, text: '', type: 'error' })
  // 批量写入用户档案缓存（忽略空值），用于聊天展示兜底
  const upsertUserInfos = useCallback((infos) => {
    if (!infos || !Array.isArray(infos)) return
    setUserInfoCache((prev) => {
      const next = { ...prev }
      infos.forEach((info) => {
        if (info && (info.userId || info.systemUserId)) {
          // 主键：userId（Keycloak sub）
          if (info.userId) {
            next[info.userId] = { ...next[info.userId], ...info }
          }
          // 兼容 systemUserId 作为次键，便于 senderId/systemUserId 混用场景兜底
          if (info.systemUserId) {
            const sysId = String(info.systemUserId)
            next[sysId] = { ...next[sysId], ...info }
          }
        }
      })
      return next
    })
  }, [])

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
    isOwner,
    ownerUserId,
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
  } = useGomokuGame({ 
    roomId, 
    onForbidden: showForbiddenTip, 
    onMessage: showMessage, 
    currentUserId,
    onKicked: useCallback((event) => {
      // 处理事件格式：可能是 { type: 'KICKED', payload: { reason: '...' } } 或 { reason: '...' }
      let reason = ROOM_MESSAGES.KICKED_OUT_REASON
      if (event.type === 'KICKED' && event.payload) {
        reason = event.payload.reason || reason
      } else if (event.reason) {
        reason = event.reason
      }
      // 立即显示弹窗，等待用户手动点击确认后再跳转
      setKickedModal({ show: true, reason })
      // 刷新进行中对局状态，确保被踢后状态清理
      refreshOngoing?.()
    }, [refreshOngoing])
  })
  // 根据 senderId / senderName 解析展示名：senderName > 本地缓存 > 座位信息 > senderId
  const resolveDisplayName = useCallback(
    (senderId, senderName) => {
      if (senderName) return senderName
      const key = senderId ? String(senderId) : null
      const cachedProfile = key ? userInfoCache[key] : null
      if (cachedProfile) {
        return cachedProfile.nickname?.trim() || cachedProfile.username?.trim() || key
      }
      // 兜底：直接查当前座位信息，避免缓存缺失时显示纯 ID
      const candidates = [seatXUserInfo, seatOUserInfo]
      for (const info of candidates) {
        if (!info) continue
        const userIdMatch = info.userId && String(info.userId) === key
        const sysIdMatch = info.systemUserId && String(info.systemUserId) === key
        if (userIdMatch || sysIdMatch) {
          return (
            info.nickname?.trim() ||
            info.username?.trim() ||
            (info.userId ? String(info.userId) : null) ||
            key
          )
        }
      }
      return key || 'Unknown'
    },
    [seatOUserInfo, seatXUserInfo, userInfoCache],
  )
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
  const [chatError, setChatError] = useState(null)

  // 房间聊天历史：进入房间时拉取最近 50 条
  useEffect(() => {
    if (!roomId) {
      setChatHistory(INITIAL_CHAT_MESSAGES)
      return
    }
    let cancelled = false
    // 先清空再加载，避免跨房间串消息
    setChatHistory(INITIAL_CHAT_MESSAGES)
    ;(async () => {
      try {
        const history = await getRoomChatHistory(roomId, 50)
        if (cancelled) return
        if (!history || history.length === 0) return
        const mapped = history
          .map((m) => mapHistoryMessage(m, currentUserId, resolveDisplayName))
          .filter(Boolean)
        // 按时间排序
        mapped.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        setChatHistory(mapped)
      } catch (e) {
        // 历史获取失败，静默
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId, currentUserId, resolveDisplayName])

  // 懒加载用户档案：若收到消息只有 senderId，没有名字，则拉取后端并刷新已收到的消息显示名
  const ensureUserProfile = useCallback(
    async (userId) => {
      if (!userId) return
      const key = String(userId)
      if (pendingUserFetch.current.has(key)) return
      pendingUserFetch.current.add(key)
      try {
        const info = await getUserInfo(key)
        if (info && info.userId) {
          upsertUserInfos([info])
          const newName = resolveDisplayName(key, null)
          setChatHistory((prev) =>
            prev.map((msg) =>
              msg.senderId && String(msg.senderId) === key
                ? {
                    ...msg,
                    senderName: newName,
                    text: `${newName}: ${msg.contentRaw ?? ''}`,
                  }
                : msg,
            ),
          )
        }
      } catch (e) {
        // 懒加载用户档案失败，静默处理
      } finally {
        pendingUserFetch.current.delete(key)
      }
    },
    [resolveDisplayName, upsertUserInfos],
  )
  const [victoryInfo, setVictoryInfo] = useState({ show: false, winnerName: '-', side: 'black' })
  const [leaving, setLeaving] = useState(false)
  const [kicking, setKicking] = useState(false)
  const [kickedModal, setKickedModal] = useState({ show: false, reason: '' })
  const seatKeyRef = useRef(null)
  // 记录被踢玩家的名字，用于显示 toast
  const kickedPlayerNameRef = useRef(null)
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
    // 进入房间时，写入房间座位的用户档案，避免缓存缺失导致聊天显示 userId
    upsertUserInfos([seatXUserInfo, seatOUserInfo])
  }, [refreshOngoing, roomId, seatXUserInfo, seatOUserInfo, upsertUserInfos])

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
        // 验证对局状态失败，静默处理
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

  // 将座位用户档案写入前端缓存，便于聊天/展示兜底（包含昵称、头像等）
  useEffect(() => {
    upsertUserInfos([seatXUserInfo, seatOUserInfo])
  }, [seatXUserInfo, seatOUserInfo, upsertUserInfos])

  // 房间聊天消息处理回调（使用 useCallback 确保引用稳定，避免重复订阅）
  const handleChatMessage = useCallback((evt) => {
    const { senderId, senderName, content, timestamp } = evt || {}
    const isSelf = senderId && senderId === currentUserId
    const type = isSelf ? 'player1' : 'player2'
    const displayName = resolveDisplayName(senderId, senderName)
    if (senderId && (!senderName || displayName === String(senderId))) {
      // 缺失展示名时触发懒加载档案
      ensureUserProfile(senderId)
    }
    setChatHistory((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() || String(Date.now()),
        type,
        senderId: senderId ? String(senderId) : undefined,
        senderName: displayName,
        contentRaw: content || '',
        text: `${displayName}: ${content || ''}`,
        timestamp,
      },
    ])
  }, [currentUserId, resolveDisplayName, ensureUserProfile])

  // 房间聊天：独立 WS 连接（并行于游戏 WS）
  const { connected: chatConnected, reconnecting: chatReconnecting, error: chatWsError, send: sendChatWs } = useChatRoomWs({
    roomId,
    onMessage: handleChatMessage,
  })

  useEffect(() => {
    if (chatWsError) {
      // Chat WebSocket 错误，静默处理
      setChatError(chatWsError)
    } else {
      setChatError(null)
    }
  }, [chatWsError])

  useEffect(() => {
    if (!user) return
    const avatarVersion = user?.updatedAt || user?.avatarUpdatedAt || user?.lastModifiedAt || Date.now()
    const avatarSrc = withCacheBust(user.avatarUrl?.trim(), avatarVersion) || DEFAULT_AVATAR
    setSelfPlayer((prev) => ({
      ...prev,
      name: user.nickname?.trim() || user.username || prev.name,
      avatar: avatarSrc,
      isOwner: isOwner ?? false,
    }))
    // 缓存当前用户完整档案，便于聊天/头像展示兜底
    if (user?.userId) {
      upsertUserInfos([{ ...user, avatarUrl: avatarSrc }])
    }
  }, [user, isOwner, upsertUserInfos])

  // 当用户信息更新时，更新本地缓存（不调用后端接口）
  // 前端通过比较 useAuth 的 user 对象变化来感知用户信息更新
  // 当用户在个人中心修改信息后，ProfilePage 会调用 refreshUser() 更新全局 user 对象
  const prevUserRef = useRef(user)
  useEffect(() => {
    if (!user) {
      prevUserRef.current = user
      return
    }
    
    const prevUser = prevUserRef.current
    // 检测用户信息是否发生变化（昵称、用户名或头像）
    const userInfoChanged = 
      prevUser && 
      (prevUser.nickname !== user.nickname || 
       prevUser.username !== user.username || 
       prevUser.avatarUrl !== user.avatarUrl)
    
    if (userInfoChanged) {
      const avatarVersion = user?.updatedAt || user?.avatarUpdatedAt || user?.lastModifiedAt || Date.now()
      const avatarSrc = withCacheBust(user.avatarUrl?.trim(), avatarVersion) || DEFAULT_AVATAR
      // 用户信息已更新，直接更新本地缓存（不调用后端接口）
      // 因为后端 Redis 缓存已经通过 updateProfile 更新了
      // 下次getRoomView 返回的快照会包含最新的用户信息
      // 这里只更新本地缓存，确保前端显示立即更新
      if (user?.userId) {
        upsertUserInfos([{ ...user, avatarUrl: avatarSrc }])
      }
    }
    
    prevUserRef.current = user
  }, [user, upsertUserInfos])

  useEffect(() => {
    // 如果 mySide 已设置，更新自己的玩家信息
    if (mySide) {
      setSelfPlayer((prev) => ({
        ...prev,
        sideBadgeClass: mySide === 'O' ? 'side-white' : 'side-black',
        sideText: mySide === 'O' ? 'White' : 'Black',
      }))
    } else if (!mySide && currentUserId) {
      // 兜底：如果 mySide 还没下发，根据座位判断自己是黑/白，避免默认显示黑棋
      if (currentUserId === seatXUserId) {
        setSelfPlayer((prev) => ({
          ...prev,
          sideBadgeClass: 'side-black',
          sideText: 'Black',
        }))
      } else if (currentUserId === seatOUserId) {
        setSelfPlayer((prev) => ({
          ...prev,
          sideBadgeClass: 'side-white',
          sideText: 'White',
        }))
      }
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
    
    // 判断对手是否是房主
    const isOpponentOwner = ownerUserId && opponentUserId && ownerUserId === opponentUserId

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
    // 优先使用本地缓存（userInfoCache）作为兜底，确保用户信息更新后能立即显示
    let opponentName = 'Waiting...'
    let opponentAvatar = DEFAULT_AVATAR
    const normalizedMode = mode ? String(mode).toUpperCase() : null
    if (normalizedMode === 'PVE') {
      opponentName = 'AI Opponent'
    } else if (shouldShowOpponent) {
      // 优先从本地缓存获取（如果缓存中有更新的信息）
      const cachedOpponentInfo = opponentUserId ? userInfoCache[String(opponentUserId)] : null
      const finalOpponentInfo = cachedOpponentInfo || opponentInfo
      
      if (finalOpponentInfo) {
        // 优先使用 nickname，其次 username，最后才使用 userId 作为后备
        const nick = finalOpponentInfo.nickname && String(finalOpponentInfo.nickname).trim()
        const uname = finalOpponentInfo.username && String(finalOpponentInfo.username).trim()
        // 只有当 nickname 和 username 都为空时，才使用 userId 作为后备
        if (nick) {
          opponentName = nick
        } else if (uname) {
          opponentName = uname
        } else {
          // 如果 nickname 和 username 都为空，但 finalOpponentInfo 存在，说明数据可能还没完全加载
          // 暂时保持 'Waiting...'，等待后续数据更新
          opponentName = 'Waiting...'
        }
        // 从 finalOpponentInfo 中获取 avatar
        if (finalOpponentInfo.avatarUrl && String(finalOpponentInfo.avatarUrl).trim()) {
          opponentAvatar = String(finalOpponentInfo.avatarUrl).trim()
        } else if (finalOpponentInfo.avatar && String(finalOpponentInfo.avatar).trim()) {
          opponentAvatar = String(finalOpponentInfo.avatar).trim()
        }
      } else {
        // finalOpponentInfo 不存在，说明数据还没加载，保持 'Waiting...'
        opponentName = 'Waiting...'
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
      userId: opponentUserId, // 添加userId，用于踢人功能
      avatar: opponentAvatar, // 使用从 opponentInfo 中获取的 avatar
      countdownText: prev.countdownText || '--',
      countdownClass: prev.countdownClass || '',
      countdownProgress: prev.countdownProgress ?? 0,
      isWinner: prev.isWinner ?? false,
      isActive: prev.isActive ?? false,
      isOwner: isOpponentOwner ?? false,
    }))
  }, [mySide, mode, seatXUserId, seatOUserId, currentUserId, seatXUserInfo, seatOUserInfo, ownerUserId, userInfoCache])

  // 调试：监听 opponentPlayer 的变化（生产环境已不输出日志）
  useEffect(() => {}, [opponentPlayer])

  // 检测踢人成功：当对手被移除时显示 toast
  const prevOpponentUserIdRef = useRef(null)
  useEffect(() => {
    const prevUserId = prevOpponentUserIdRef.current
    const currentUserId = opponentPlayer.userId
    
    // 如果之前有对手，现在对手被移除了（变成 null 或 "Waiting..."），且记录了被踢玩家名字
    if (prevUserId && !currentUserId && kickedPlayerNameRef.current) {
      const kickedName = kickedPlayerNameRef.current
      showMessage(ROOM_MESSAGES.KICKED_PLAYER_SUCCESS(kickedName), 'info')
      kickedPlayerNameRef.current = null
    }
    
    // 更新上一次的对手用户ID
    prevOpponentUserIdRef.current = currentUserId
  }, [opponentPlayer.userId, showMessage])

  useEffect(() => {
    const statusText =
      roomPhase === 'WAITING'
        ? 'Waiting'
        : roomPhase === 'PLAYING'
          ? 'Playing'
          : roomPhase === 'ENDED'
            ? 'Finished'
            : gameStatus?.label ?? DEFAULT_STATUS.gameStatus

    setStatusBar((prev) => ({
      ...prev,
      turnText: sideToMove === 'O' ? 'White to play' : 'Black to play',
      current: sideToMove === 'O' ? 'White' : 'Black',
      round: roundInfo?.round ?? prev.round,
      score: `${scoreInfo?.black ?? 0}:${scoreInfo?.white ?? 0}`,
      gameStatus: statusText,
    }))
    setSelfPlayer((prev) => ({ ...prev, isActive: sideToMove !== 'O' }))
    setOpponentPlayer((prev) => ({ ...prev, isActive: sideToMove === 'O' }))
  }, [gameStatus, roomPhase, roundInfo, scoreInfo, sideToMove])

  const handleSendChat = useCallback(
    (text) => {
      const trimmed = text.trim()
      if (!trimmed || !roomId) return
      try {
        sendChatWs(trimmed)
      } catch (err) {
        // 发送房间聊天失败，静默处理
      }
    },
    [roomId, sendChatWs],
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

  // 点击准备/取消准备
  const handleToggleReady = useCallback(() => {
    toggleReady()
  }, [toggleReady])

  // 计算自己与对手的准备状态，用于在左右两侧展示
  const selfReady = useMemo(() => {
    if (!readyStatus) return false
    return !!readyStatus[currentUserId]
  }, [readyStatus, currentUserId])

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
      // 离开房间失败，静默处理
      window.alert('离开房间失败，请稍后再试')
    } finally {
      setLeaving(false)
      navigate('/lobby')
    }
  }, [leaving, navigate, refreshOngoing, roomId])

  // 计算是否可以踢人
  const canKickPlayer = useMemo(() => {
    // 必须是房主
    if (!isOwner) return false
    // 必须是PVP模式
    if (mode === 'PVE') return false
    // 必须是WAITING状态（不能是PLAYING或ENDED）
    if (roomPhase !== 'WAITING') return false
    // 对手必须存在
    if (!opponentPlayer.userId || opponentPlayer.name === 'Waiting...') return false
    // 不能踢自己
    if (opponentPlayer.userId === currentUserId) return false
    return true
  }, [isOwner, mode, roomPhase, opponentPlayer.userId, opponentPlayer.name, currentUserId])


  // 关闭被踢弹窗并跳转（如果还在当前页面）
  const handleKickedModalClose = useCallback(() => {
    setKickedModal({ show: false, reason: '' })
    // 如果还在游戏房间页面，才跳转（可能已经自动跳转了）
    if (window.location.pathname.startsWith('/game/')) {
      navigate('/lobby')
    }
  }, [navigate])

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

  // 踢人确认对话框状态
  const [kickConfirmModal, setKickConfirmModal] = useState({ show: false, targetName: '', targetUserId: '' })

  // 打开踢人确认对话框
  const handleOpenKickConfirm = useCallback(() => {
    if (!opponentPlayer.userId || opponentPlayer.name === 'Waiting...') return
    setKickConfirmModal({
      show: true,
      targetName: opponentPlayer.name,
      targetUserId: opponentPlayer.userId,
    })
  }, [opponentPlayer.name, opponentPlayer.userId])

  // 确认踢人
  const handleConfirmKick = useCallback(async () => {
    if (kicking || !kickConfirmModal.targetUserId) return
    
    setKicking(true)
    try {
      const storedSeatKey = localStorage.getItem(`gomoku_seatKey_${roomId}`)
      // 记录被踢玩家的名字，用于后续显示 toast
      kickedPlayerNameRef.current = kickConfirmModal.targetName
      sendKick(roomId, kickConfirmModal.targetUserId, storedSeatKey)
      setKickConfirmModal({ show: false, targetName: '', targetUserId: '' })
    } catch (error) {
      // 踢人失败，静默处理
      window.alert(`踢人失败：${error.message || '未知错误'}`)
      kickedPlayerNameRef.current = null
    } finally {
      setKicking(false)
    }
  }, [kicking, roomId, kickConfirmModal.targetUserId, kickConfirmModal.targetName])

  // 取消踢人确认
  const handleCancelKick = useCallback(() => {
    setKickConfirmModal({ show: false, targetName: '', targetUserId: '' })
  }, [])

  return (
    <div className="game-room">
      <main className="game-layout">
        <GameStatusBar 
          status={statusBar} 
          capsules={statusCapsules} 
          onForbiddenTip={showForbiddenTip}
          isOwner={isOwner}
          mode={mode}
          roomPhase={roomPhase}
          canKickPlayer={canKickPlayer}
          opponentPlayer={opponentPlayer}
          onKickPlayer={handleOpenKickConfirm}
        />

        <div className="player-panel player-left">
          <PlayerCard
            idPrefix="self"
            player={selfPlayer}
            wsConnected={wsConnected}
            isOwner={isOwner}
            readyLabel={selfReady ? '已准备' : '未准备'}
            readyAccent={selfReady}
            readyButtonLabel={roomPhase !== 'PLAYING' ? (selfReady ? '取消准备' : '准备') : null}
            onToggleReady={roomPhase !== 'PLAYING' ? handleToggleReady : null}
          />
          <GameChatPanel messages={chatHistory} onSend={handleSendChat} chatConnected={chatConnected} chatReconnecting={chatReconnecting} chatError={chatError} />
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
          <div className="board-container">
            {/* 开始游戏按钮：固定在棋盘顶部居中，仅房主可见，不影响棋盘位置 */}
            {isOwner && roomPhase === 'WAITING' && (
              <button
                type="button"
                className="btn-start-game-fixed"
                onClick={requestStartGame}
                disabled={!wsConnected || !canStartGame()}
              >
                开始游戏
              </button>
            )}
            {/* 非房主等待提示：固定在棋盘顶部居中，仅非房主可见 */}
            {!isOwner && roomPhase === 'WAITING' && (
              <div className="game-waiting-badge">
                等待房主开始游戏
              </div>
            )}
            {/* 游戏状态提示：固定在棋盘右上角，不影响棋盘位置 */}
            {roomPhase === 'PLAYING' && (
              <div className="game-status-badge">
                游戏进行中
              </div>
            )}
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
            isOwner={opponentPlayer.isOwner ?? false}
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
      <KickedModal show={kickedModal.show} reason={kickedModal.reason} onClose={handleKickedModalClose} />
      <KickConfirmModal 
        show={kickConfirmModal.show}
        targetName={kickConfirmModal.targetName}
        onConfirm={handleConfirmKick}
        onCancel={handleCancelKick}
        disabled={kicking}
      />
    </div>
  )
}

// 被踢弹窗组件 - 美化版本，参考系统风格
const KickedModal = ({ show, reason, onClose }) => {
  if (!show) return null
  
  return (
    <div 
      className={`kicked-modal ${show ? 'show' : ''}`}
      onClick={(e) => {
        // 点击遮罩层不关闭，必须点击确定按钮
        e.stopPropagation()
      }}
    >
      <div 
        className="kicked-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kicked-modal-icon">👢</div>
        <div className="kicked-modal-header">
          <h3>{ROOM_MESSAGES.KICKED_OUT_TITLE}</h3>
        </div>
        <div className="kicked-modal-body">
          <p>{reason}</p>
        </div>
        <div className="kicked-modal-footer">
          <button
            type="button"
            className="kicked-modal-btn"
            onClick={onClose}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

const GameStatusBar = ({ status, capsules, onForbiddenTip, isOwner, mode, roomPhase, canKickPlayer, opponentPlayer, onKickPlayer }) => {
  return (
    <div className="game-status-bar">
      <div className="game-status-bar-left">
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
      {isOwner && (
        <div className="game-status-bar-right">
          <HostControls 
            mode={mode}
            roomPhase={roomPhase}
            canKickPlayer={canKickPlayer}
            opponentPlayer={opponentPlayer}
            onKickPlayer={onKickPlayer}
          />
        </div>
      )}
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
  isOwner = false,
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
          <div className="player-name-wrapper">
            <div className="player-name" id={`${idPrefix}Name`}>
              {player.name}
            </div>
            {isOwner && (
              <span className="player-owner-badge" title="房主">
                房主
              </span>
            )}
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

const GameChatPanel = ({ messages, onSend, chatConnected, chatReconnecting, chatError }) => {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
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
        <span className={`chat-conn-dot ${chatConnected ? 'ok' : chatReconnecting ? 'reconnecting' : 'bad'}`}>
          {chatConnected ? '●' : chatReconnecting ? '⟳' : '○'}
        </span>
        {chatReconnecting && <span className="chat-reconnecting-text">重连中...</span>}
      </div>
      <div className="game-chat-messages" id="gameChatMessages" ref={listRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`game-chat-message ${msg.type}`}>
            {msg.text}
          </div>
        ))}
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
          {info.type === 'error' ? '⚠️' : info.type === 'warning' ? '⚠️' : 'ℹ️'}
        </span>
        <span className="message-toast-text">{info.text}</span>
      </div>
    </div>
  )
}

// 房主控制菜单组件
const HostControls = ({ mode, roomPhase, canKickPlayer, opponentPlayer, onKickPlayer }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const handleKickClick = () => {
    if (canKickPlayer && onKickPlayer) {
      onKickPlayer()
      setMenuOpen(false)
    }
  }

  return (
    <div className="host-controls" ref={menuRef}>
      <button
        type="button"
        className="host-controls-btn"
        onClick={() => setMenuOpen(!menuOpen)}
        title="房间管理"
        aria-label="房间管理"
      >
        <span className="host-controls-icon">⚙</span>
      </button>
      {menuOpen && (
        <div className="host-controls-menu">
          {canKickPlayer && opponentPlayer.userId && opponentPlayer.name !== 'Waiting...' && (
            <button
              type="button"
              className="host-controls-menu-item host-controls-menu-item-danger"
              onClick={handleKickClick}
            >
              <span className="menu-item-icon">👢</span>
              <span className="menu-item-text">踢出玩家：{opponentPlayer.name}</span>
            </button>
          )}
          <div className="host-controls-menu-divider" />
          <button
            type="button"
            className="host-controls-menu-item"
            onClick={() => {
              setMenuOpen(false)
              // 可以添加其他功能，如房间设置等
            }}
            disabled
          >
            <span className="menu-item-icon">⚙</span>
            <span className="menu-item-text">房间设置</span>
            <span className="menu-item-badge">即将推出</span>
          </button>
        </div>
      )}
    </div>
  )
}

// 踢人确认对话框组件
const KickConfirmModal = ({ show, targetName, onConfirm, onCancel, disabled }) => {
  if (!show) return null

  return (
    <div 
      className="kick-confirm-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div className="kick-confirm-modal-content">
        <div className="kick-confirm-modal-header">
          <div className="kick-confirm-modal-icon">⚠️</div>
          <h3>确认踢出玩家</h3>
        </div>
        <div className="kick-confirm-modal-body">
          <p>确定将玩家 <strong>{targetName}</strong> 踢出房间吗？</p>
          <p className="kick-confirm-modal-warning">踢出后，该玩家将无法继续游戏。</p>
        </div>
        <div className="kick-confirm-modal-footer">
          <button
            type="button"
            className="kick-confirm-modal-btn kick-confirm-modal-btn-cancel"
            onClick={onCancel}
            disabled={disabled}
          >
            取消
          </button>
          <button
            type="button"
            className="kick-confirm-modal-btn kick-confirm-modal-btn-confirm"
            onClick={onConfirm}
            disabled={disabled}
          >
            {disabled ? '处理中...' : '确认踢出'}
          </button>
        </div>
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

