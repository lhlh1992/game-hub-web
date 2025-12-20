import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  connectWebSocket,
  subscribeRoom,
  subscribeSeatKey,
  subscribeFullSync,
  subscribeKicked,
  sendPlace,
  sendResign,
  sendRestart,
  sendResume,
  sendReady,
  sendStartGame,
  disconnectWebSocket,
  isConnected,
} from '../services/ws/gomokuSocket.js'
import { getRoomView, getUserInfos } from '../services/api/gameApi.js'

const BOARD_SIZE = 15
const EMPTY_BOARD = Array(BOARD_SIZE)
  .fill(null)
  .map(() => Array(BOARD_SIZE).fill(null))

const WIN_DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

const normalizeSide = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    if (value === 0) return 'X'
    if (value === 1) return 'O'
  }
  const text = String(value).trim()
  if (!text || text === '.') {
    return null
  }
  const upper = text.toUpperCase()
  switch (upper) {
    case 'X':
    case 'BLACK':
    case 'B':
    case 'X_WIN':
      return 'X'
    case 'O':
    case 'WHITE':
    case 'W':
    case 'O_WIN':
      return 'O'
    case '0':
      return 'X'
    case '1':
      return 'O'
    default:
      return null
  }
}

const normalizeCellValue = (value) => normalizeSide(value)

const matchesPiece = (cell, piece) => {
  if (!piece) return false
  return normalizeSide(cell) === piece
}

const collectWinLineForPiece = (grid, piece) => {
  if (!piece || !Array.isArray(grid) || !grid.length) {
    return null
  }
  const size = grid.length
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (!matchesPiece(grid?.[x]?.[y], piece)) {
        continue
      }
      for (let dirIdx = 0; dirIdx < WIN_DIRS.length; dirIdx += 1) {
        const [dx, dy] = WIN_DIRS[dirIdx]
        const prevX = x - dx
        const prevY = y - dy
        if (
          prevX >= 0 &&
          prevX < size &&
          prevY >= 0 &&
          prevY < size &&
          matchesPiece(grid?.[prevX]?.[prevY], piece)
        ) {
          continue
        }

        const coords = []
        let cx = x
        let cy = y
        while (cx >= 0 && cx < size && cy >= 0 && cy < size && matchesPiece(grid?.[cx]?.[cy], piece)) {
          coords.push([cx, cy])
          cx += dx
          cy += dy
        }
        if (coords.length >= 5) {
          const firstFive = coords.slice(0, 5)
          const winSet = new Set(firstFive.map(([px, py]) => `${px},${py}`))
          return {
            piece,
            cells: winSet,
          }
        }
      }
    }
  }
  return null
}

const detectWinLineCells = (grid, winnerHint) => {
  if (!Array.isArray(grid) || !grid.length) {
    return null
  }
  const normalizedHint = normalizeSide(winnerHint)
  const candidates = normalizedHint ? [normalizedHint, 'X', 'O'] : ['X', 'O']
  const seen = new Set()
  for (let i = 0; i < candidates.length; i += 1) {
    const piece = candidates[i]
    if (!piece || seen.has(piece)) {
      continue
    }
    seen.add(piece)
    const result = collectWinLineForPiece(grid, piece)
    if (result) {
      return result
    }
  }
  return null
}

const normalizeWinnerPiece = (value) => normalizeSide(value)

export function useGomokuGame({ roomId, onForbidden, onMessage, currentUserId, onKicked }) {
  const [board, setBoard] = useState(EMPTY_BOARD)
  const [lastMove, setLastMove] = useState(null)
  const [winLines, setWinLines] = useState(new Set())
  const [sideToMove, setSideToMove] = useState('X')
  const [roundInfo, setRoundInfo] = useState({ round: 1, current: 'X' })
  const [scoreInfo, setScoreInfo] = useState({ black: 0, white: 0, draws: 0 })
  const [gameStatus, setGameStatus] = useState({ over: false, winner: null, label: 'Playing' })
  const [mySide, setMySide] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [systemLogs, setSystemLogs] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [readyStatus, setReadyStatus] = useState({}) // Map<userId, ready>
  const [roomPhase, setRoomPhase] = useState('WAITING') // WAITING, PLAYING, ENDED
  const [isOwner, setIsOwner] = useState(false) // 是否是房主
  const [ownerUserId, setOwnerUserId] = useState(null) // 房主用户ID
  const [mode, setMode] = useState(null) // 'PVP' | 'PVE'
  const [aiSide, setAiSide] = useState(null) // 'X' | 'O' | null
  const [seatXUserId, setSeatXUserId] = useState(null) // 黑棋座位用户ID（新增：用于显示玩家信息）
  const [seatOUserId, setSeatOUserId] = useState(null) // 白棋座位用户ID（新增：用于显示玩家信息）
  const [seatXUserInfo, setSeatXUserInfo] = useState(null) // 黑棋座位用户详细信息
  const [seatOUserInfo, setSeatOUserInfo] = useState(null) // 白棋座位用户详细信息
  const [seatXConnected, setSeatXConnected] = useState(false) // 黑棋座位玩家连接状态
  const [seatOConnected, setSeatOConnected] = useState(false) // 白棋座位玩家连接状态
  const [roomCreatedAt, setRoomCreatedAt] = useState(null) // 房间创建时间（新增）

  const roomRef = useRef(roomId)
  const seatKeyRef = useRef(null)
  const boardRef = useRef(EMPTY_BOARD)

  useEffect(() => {
    boardRef.current = board
  }, [board])

  // 更新 roomId ref
  useEffect(() => {
    roomRef.current = roomId
  }, [roomId])

  // 首屏加载：先通过 HTTP 获取房间全貌（不依赖 WebSocket）
  useEffect(() => {
    if (!roomId) {
      return
    }

    let mounted = true

    // 首屏通过 HTTP 获取房间全貌，确保即使 WebSocket 未连接也能看到房间状态
    getRoomView(roomId)
      .then((snap) => {
        if (!mounted) return
        handleFullSync(snap)
      })
      .catch((error) => {
        if (!mounted) return
        onMessage?.(`加载房间信息失败: ${error.message}`, 'error')
      })

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]) // handleFullSync 是稳定的，不需要加入依赖项（避免循环依赖）

  // WebSocket 连接管理
  useEffect(() => {
    if (!roomId) {
      return
    }

    let mounted = true
    let checkInterval = null
    let unsubscribeKicked = null
    let reconnectMessageTimer = null

    const handleConnect = () => {
      if (!mounted) return
      setWsConnected(true)
      // 清除重连提示
      if (reconnectMessageTimer) {
        clearTimeout(reconnectMessageTimer)
        reconnectMessageTimer = null
      }

      // 订阅房间事件
      subscribeRoom(roomId, (evt) => {
        if (!mounted) return
        handleRoomEvent(evt)
      })

      // 订阅 seatKey
      subscribeSeatKey((seatKey, side) => {
        if (!mounted) return
        seatKeyRef.current = seatKey
        setMySide(side)
      })

      // 订阅完整同步（WebSocket 重连时的 FullSync）
      subscribeFullSync((snap) => {
        if (!mounted) return
        handleFullSync(snap)
      })

      // 订阅被踢事件
      if (onKicked) {
        unsubscribeKicked = subscribeKicked((event) => {
          if (!mounted) return
          // 直接传递整个事件对象，让调用者处理
          onKicked(event)
        })
      }

      // 发送恢复请求
      sendResume(roomId, seatKeyRef.current)
      
      // WebSocket 连接后，立即获取一次最新房间快照（确保获取最新的座位信息）
      // 因为可能有其他玩家通过 HTTP joinRoom，而 WebSocket 可能还没连接
      getRoomView(roomId)
        .then((snap) => {
          if (!mounted) return
          handleFullSync(snap)
        })
        .catch((error) => {
          if (!mounted) return
          // 静默失败，不影响用户体验
        })
    }

    const handleDisconnect = () => {
      if (!mounted) return
      setWsConnected(false)
      // 不在这里显示提示，让 handleReconnecting 统一处理
    }

    const handleError = (error) => {
      if (!mounted) return
      setWsConnected(false)
    }

    const handleReconnecting = (attempt, delay) => {
      if (!mounted) return
      setWsConnected(false)
      // 延迟显示重连提示，避免频繁闪烁
      if (reconnectMessageTimer) {
        clearTimeout(reconnectMessageTimer)
      }
      reconnectMessageTimer = setTimeout(() => {
        if (mounted) {
          onMessage?.('连接断开，正在重连...', 'warning')
        }
      }, 1000)
    }

    const handleReconnectFailed = () => {
      if (!mounted) return
      if (reconnectMessageTimer) {
        clearTimeout(reconnectMessageTimer)
        reconnectMessageTimer = null
      }
      onMessage?.('连接失败，请刷新页面重试', 'error')
    }

    // 连接 WebSocket
    connectWebSocket({
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
      onReconnecting: handleReconnecting,
      onReconnectFailed: handleReconnectFailed,
      onKicked: (reason) => {
        if (!mounted) return
        setWsConnected(false)
        // 将被踢原因交给上层处理（GameRoomPage 已有踢出弹窗）
        onKicked?.({ reason: reason || '账号已在其他终端登录' })
      },
    })

    // 定期检查连接状态（作为备用）
    checkInterval = setInterval(() => {
      if (mounted) {
        const connected = isConnected()
        if (connected !== wsConnected) {
          setWsConnected(connected)
        }
      }
    }, 5000)

    return () => {
      mounted = false
      if (checkInterval) {
        clearInterval(checkInterval)
      }
      if (reconnectMessageTimer) {
        clearTimeout(reconnectMessageTimer)
      }
      if (unsubscribeKicked) {
        unsubscribeKicked()
      }
      disconnectWebSocket()
    }
  }, [roomId, onMessage, onKicked])

  // 处理房间事件
  const handleRoomEvent = useCallback((evt) => {
    if (evt.type === 'STATE') {
      const { state, series } = evt.payload || {}
      if (state) {
        updateGameState(state)
      }
      if (series) {
        updateSeriesInfo(series)
      }
    } else if (evt.type === 'SNAPSHOT') {
      // 统一使用 SNAPSHOT 事件更新房间全貌（包含座位、准备状态、phase 等）
      const snap = evt.payload
      if (snap) {
        handleFullSync(snap)
      }
    } else if (evt.type === 'TICK') {
      const tick = evt.payload || {}
      if (tick.side) {
        setCountdown({
          side: tick.side,
          seconds: Number.isFinite(tick.left) ? tick.left : null,
          deadlineEpochMs: tick.deadlineEpochMs,
        })
      } else {
        setCountdown(null)
      }
    } else if (evt.type === 'ERROR') {
      const errorMsg = evt.payload
      if (errorMsg) {
        if (errorMsg.includes('禁手') || errorMsg.includes('forbidden')) {
          onForbidden?.()
        } else {
          onMessage?.(errorMsg, 'error')
        }
      }
    } else if (evt.type === 'READY_STATUS') {
      // 已废弃：准备状态更新 - 统一使用 SNAPSHOT 事件
      // 保留此分支仅为向后兼容，新代码应依赖 SNAPSHOT 事件
      const status = evt.payload || {}
      setReadyStatus(status)
    } else if (evt.type === 'ROOM_STATUS') {
      // 已废弃：房间状态更新 - 统一使用 SNAPSHOT 事件
      // 保留此分支仅为向后兼容，新代码应依赖 SNAPSHOT 事件
      const status = evt.payload || {}
      if (status.phase) {
        setRoomPhase(status.phase)
      }
    }
  }, [onForbidden, onMessage])

  const buildBoardFromPayload = useCallback((payload) => {
    if (!payload) {
      return null
    }
    const next = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null))

    const grid = Array.isArray(payload?.grid) ? payload.grid : payload

    if (Array.isArray(grid)) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        for (let y = 0; y < BOARD_SIZE; y += 1) {
          const value = grid?.[x]?.[y]
          const normalized = normalizeCellValue(value)
          if (normalized) {
            next[x][y] = normalized
          }
        }
      }
      return next
    }

    if (typeof grid === 'string') {
      for (let i = 0; i < BOARD_SIZE; i += 1) {
        for (let j = 0; j < BOARD_SIZE; j += 1) {
          const idx = i * BOARD_SIZE + j
          const char = grid[idx]
          const normalized = normalizeCellValue(char)
          if (normalized) {
            next[i][j] = normalized
          }
        }
      }
      return next
    }

    return null
  }, [])

  // 更新游戏状态
  const updateGameState = useCallback(
    (state) => {
      if (!state) return

      let nextBoard = null

      // 更新棋盘
      if (state.board) {
        const boardFromState = buildBoardFromPayload(state.board)
        if (boardFromState) {
          nextBoard = boardFromState
          boardRef.current = boardFromState
          setBoard(boardFromState)
        }
      }

      const derivedBoard = nextBoard || boardRef.current
      const stateWinnerRaw =
        state.winner ??
        (state.outcome === 'X_WIN'
          ? 'X'
          : state.outcome === 'O_WIN'
            ? 'O'
            : null)
      let normalizedWinner = normalizeWinnerPiece(stateWinnerRaw)

      // 更新最后一步
      if (state.lastMove) {
        setLastMove({ x: state.lastMove[0], y: state.lastMove[1] })
      } else {
        setLastMove(null)
      }

      // 更新获胜线
      if (state.winLines && Array.isArray(state.winLines)) {
        const winSet = new Set()
        state.winLines.forEach((line) => {
          if (Array.isArray(line)) {
            line.forEach(([x, y]) => {
              winSet.add(`${x},${y}`)
            })
          }
        })
        setWinLines(winSet)
        if (!normalizedWinner && derivedBoard) {
          const inferred = collectWinLineForPiece(derivedBoard, 'X') || collectWinLineForPiece(derivedBoard, 'O')
          if (inferred) {
            normalizedWinner = inferred.piece
          }
        }
      } else if ((state.over || normalizedWinner) && derivedBoard) {
        const detected = detectWinLineCells(derivedBoard, normalizedWinner)
        if (detected) {
          setWinLines(detected.cells)
          if (!normalizedWinner) {
            normalizedWinner = detected.piece
          }
        } else {
          setWinLines(new Set())
        }
      } else {
        setWinLines(new Set())
      }

      // 更新当前回合
      if (state.current) {
        setSideToMove(state.current.toUpperCase())
      }

      // 更新游戏状态
      if (state.over !== undefined) {
        const isOver = Boolean(state.over)
        setGameStatus({
          over: isOver,
          winner: normalizedWinner ?? state.winner ?? null,
          label: isOver ? 'Finished' : 'Playing',
        })
        // 对局结束后，前端应立即清空倒计时显示
        if (isOver) {
          setCountdown(null)
        }
      }

      // 更新回合信息
      if (state.index !== undefined) {
        setRoundInfo((prev) => ({
          ...prev,
          round: state.index || 1,
          current: state.current || 'X',
        }))
      }
    },
    [buildBoardFromPayload],
  )

  // 更新系列信息（多盘比分）
  const updateSeriesInfo = useCallback((series) => {
    if (series) {
      setScoreInfo({
        black: series.blackWins || 0,
        white: series.whiteWins || 0,
        draws: series.draws || 0,
      })
      if (series.currentIndex) {
        setRoundInfo((prev) => ({
          ...prev,
          round: series.currentIndex,
        }))
      }
    }
  }, [])

  // 处理完整同步
  // 兜底获取用户信息的函数（当快照中没有用户信息时调用）
  const fetchUserInfoFallback = useCallback(
    async (userId, seat) => {
      if (!userId || !seat) return
      
      try {
        const userInfos = await getUserInfos([userId])
        if (userInfos && userInfos.length > 0) {
          const userInfo = userInfos[0]
          // 更新对应的用户信息
          if (seat === 'X') {
            setSeatXUserInfo(userInfo)
          } else if (seat === 'O') {
            setSeatOUserInfo(userInfo)
          }
        }
      } catch (error) {
        // 静默失败，不影响用户体验
        // 获取用户信息失败，静默处理
      }
    },
    []
  )

  const handleFullSync = useCallback(
    (snap) => {
      if (!snap) {
        return
      }
      if (snap.state) {
        updateGameState(snap.state)
      } else {
        const boardPayload = snap.cells || snap.board?.cells || snap.board?.grid || snap.board
        const boardFromCells = buildBoardFromPayload(boardPayload)
        let resolvedWinner =
          normalizeWinnerPiece(
            snap.winner ??
              (snap.outcome === 'X_WIN'
                ? 'X'
                : snap.outcome === 'O_WIN'
                  ? 'O'
                  : null),
          ) || null

        if (boardFromCells) {
          boardRef.current = boardFromCells
          setBoard(boardFromCells)
          if (snap.winLines && Array.isArray(snap.winLines)) {
            const snapSet = new Set()
            snap.winLines.forEach((line) => {
              if (Array.isArray(line)) {
                line.forEach(([x, y]) => snapSet.add(`${x},${y}`))
              }
            })
            setWinLines(snapSet)
            if (!resolvedWinner) {
              const inferred = collectWinLineForPiece(boardFromCells, 'X') || collectWinLineForPiece(boardFromCells, 'O')
              if (inferred) {
                resolvedWinner = inferred.piece
              }
            }
          } else {
            const detected = detectWinLineCells(boardFromCells, resolvedWinner)
            if (detected) {
              setWinLines(detected.cells)
              if (!resolvedWinner) {
                resolvedWinner = detected.piece
              }
            } else {
              setWinLines(new Set())
            }
          }
        } else {
          setWinLines(new Set())
        }
        if (snap.sideToMove) {
          setSideToMove(String(snap.sideToMove).toUpperCase())
        }
        if (snap.round) {
          setRoundInfo((prev) => ({
            ...prev,
            round: snap.round,
          }))
        }
        if (snap.scoreX !== undefined || snap.scoreO !== undefined) {
          setScoreInfo({
            black: snap.scoreX ?? scoreInfo.black,
            white: snap.scoreO ?? scoreInfo.white,
            draws: scoreInfo.draws,
          })
        }
        if (snap.outcome || snap.winner || snap.over !== undefined) {
          setGameStatus((prev) => ({
            ...prev,
            over: Boolean(snap.over ?? snap.outcome),
            winner: resolvedWinner ?? prev.winner,
            label: snap.over || snap.outcome ? 'Finished' : prev.label,
          }))
        }
      }
      // 系列信息：兼容 STATE 广播中的 series 和 Resume.FullSync 中的 seriesView
      if (snap.series) {
        updateSeriesInfo(snap.series)
      } else if (snap.seriesView) {
        updateSeriesInfo(snap.seriesView)
      }
      if (snap.seatKey) {
        seatKeyRef.current = snap.seatKey
      }
      if (snap.side) {
        setMySide(snap.side)
      } else if (snap.mySide) {
        setMySide(snap.mySide)
      }
      // 新增：从 FullSync 中恢复房间状态和准备状态，支持刷新重入
      if (snap.phase) {
        setRoomPhase(String(snap.phase).toUpperCase())
      }
      if (snap.readyStatus) {
        setReadyStatus(snap.readyStatus)
      }
      // 提取房间模式信息
      if (snap.mode) {
        setMode(String(snap.mode).toUpperCase())
      }
      if (snap.aiSide !== undefined && snap.aiSide !== null) {
        setAiSide(String(snap.aiSide).toUpperCase())
      } else {
        setAiSide(null)
      }
      // 新增：座位用户ID（用于显示玩家信息，保留用于兼容）
      if (snap.seatXUserId !== undefined) {
        const newSeatXUserId = snap.seatXUserId || null
        setSeatXUserId(newSeatXUserId)
      }
      if (snap.seatOUserId !== undefined) {
        const newSeatOUserId = snap.seatOUserId || null
        setSeatOUserId(newSeatOUserId)
      }
      
      // 新增：用户详细信息（直接从快照中获取，如果缺失则通过API兜底获取）
      if (snap.seatXUserInfo !== undefined) {
        const newSeatXUserInfo = snap.seatXUserInfo || null
        setSeatXUserInfo(newSeatXUserInfo)
        // 兜底：如果快照中没有用户信息，但userId存在，则通过API获取
        if (!newSeatXUserInfo && snap.seatXUserId) {
          fetchUserInfoFallback(snap.seatXUserId, 'X')
        }
      }
      if (snap.seatOUserInfo !== undefined) {
        const newSeatOUserInfo = snap.seatOUserInfo || null
        setSeatOUserInfo(newSeatOUserInfo)
        // 兜底：如果快照中没有用户信息，但userId存在，则通过API获取
        if (!newSeatOUserInfo && snap.seatOUserId) {
          fetchUserInfoFallback(snap.seatOUserId, 'O')
        }
      }
      // 新增：房间创建时间
      if (snap.createdAt !== undefined && snap.createdAt !== null) {
        setRoomCreatedAt(snap.createdAt)
      }
      // 新增：连接状态
      if (snap.seatXConnected !== undefined) {
        setSeatXConnected(Boolean(snap.seatXConnected))
      }
      if (snap.seatOConnected !== undefined) {
        setSeatOConnected(Boolean(snap.seatOConnected))
      }
      // 新增：房主判断
      if (snap.ownerUserId !== undefined && snap.ownerUserId !== null) {
        setOwnerUserId(snap.ownerUserId)
        // 如果快照中有有效的 ownerUserId，则判断是否与当前用户匹配
        setIsOwner(Boolean(currentUserId) && snap.ownerUserId === currentUserId)
      } else {
        // 如果 ownerUserId 为 undefined 或 null，设置为 false
        setOwnerUserId(null)
        setIsOwner(false)
      }
    },
    [buildBoardFromPayload, updateGameState, updateSeriesInfo, scoreInfo.black, scoreInfo.white, currentUserId, fetchUserInfoFallback],
  )

  // 落子
  const placeStone = useCallback(
    (event) => {
      const connected = isConnected()
      if (connected !== wsConnected) {
        setWsConnected(connected)
      }
      if (!connected) {
        onMessage?.('网络连接已断开，无法落子。请刷新页面重新连接。', 'error')
        return
      }

      // 在房间未开始（WAITING）时，前端直接禁止落子和显示棋子
      if (roomPhase === 'WAITING') {
        onMessage?.('请先双方准备，并由房主点击“开始游戏”后再落子。', 'error')
        return
      }

      const cell = event.currentTarget
      const x = parseInt(cell.dataset.x, 10)
      const y = parseInt(cell.dataset.y, 10)

      if (isNaN(x) || isNaN(y)) {
        return
      }

      if (board[x][y] !== null) {
        return
      }

      if (gameStatus?.over) {
        return
      }

      if (mySide && sideToMove !== mySide) {
        onMessage?.('不是你的回合', 'error')
        return
      }

      if (roomRef.current) {
        try {
          sendPlace(roomRef.current, x, y, sideToMove, seatKeyRef.current)
          // 不再在前端乐观落子，完全以服务端广播为准，避免未开始阶段出现“假落子”
        } catch (error) {
          // 发送失败，静默处理
          onMessage?.('落子失败，请检查网络连接后重试。', 'error')
        }
      }
    },
    [board, sideToMove, mySide, gameStatus, wsConnected, roomPhase, onMessage],
  )

  // 认输
  const requestResign = useCallback(() => {
    if (!wsConnected) {
      onMessage?.('网络连接已断开，无法认输。请刷新页面重新连接。', 'error')
      return
    }

    if (roomRef.current) {
      try {
        sendResign(roomRef.current, seatKeyRef.current)
      } catch (error) {
        // 发送失败，静默处理
        onMessage?.('认输失败，请检查网络连接后重试。', 'error')
      }
    }
  }, [wsConnected, onMessage])

  // 重开
  const requestRestart = useCallback(() => {
    if (!wsConnected) {
      onMessage?.('网络连接已断开，无法重开。请刷新页面重新连接。', 'error')
      return
    }

    if (roomRef.current) {
      try {
        sendRestart(roomRef.current, seatKeyRef.current)
      } catch (error) {
        // 发送失败，静默处理
        onMessage?.('重开失败，请检查网络连接后重试。', 'error')
      }
    }
  }, [wsConnected, onMessage])

  // 准备/取消准备
  const toggleReady = useCallback(() => {
    if (!wsConnected) {
      onMessage?.('网络连接已断开，无法准备。请刷新页面重新连接。', 'error')
      return
    }
    if (roomRef.current) {
      try {
        sendReady(roomRef.current, seatKeyRef.current)
      } catch (error) {
        // 发送失败，静默处理
        onMessage?.('准备失败，请检查网络连接后重试。', 'error')
      }
    }
  }, [wsConnected, onMessage])

  // 开始游戏（仅房主）
  const requestStartGame = useCallback(() => {
    if (!wsConnected) {
      onMessage?.('网络连接已断开，无法开始游戏。请刷新页面重新连接。', 'error')
      return
    }
    if (roomRef.current) {
      try {
        sendStartGame(roomRef.current, seatKeyRef.current)
      } catch (error) {
        // 发送失败，静默处理
        onMessage?.('开始游戏失败，请检查网络连接后重试。', 'error')
      }
    }
  }, [wsConnected, onMessage])

  return {
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
    chatMessages,
    wsConnected,
    readyStatus,
    roomPhase,
    isOwner,
    ownerUserId, // 房主用户ID
    mode, // 'PVP' | 'PVE'
    aiSide, // 'X' | 'O' | null
    seatXUserId, // 黑棋座位用户ID（新增：用于显示玩家信息）
    seatOUserId, // 白棋座位用户ID（新增：用于显示玩家信息）
    seatXUserInfo, // 黑棋座位用户详细信息
    seatOUserInfo, // 白棋座位用户详细信息
    seatXConnected, // 黑棋座位玩家连接状态
    seatOConnected, // 白棋座位玩家连接状态
    roomCreatedAt, // 房间创建时间（新增）
    placeStone,
    requestResign,
    requestRestart,
    toggleReady,
    requestStartGame,
  }
}
