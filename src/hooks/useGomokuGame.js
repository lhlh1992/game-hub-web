import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  connectWebSocket,
  subscribeRoom,
  subscribeSeatKey,
  subscribeFullSync,
  sendPlace,
  sendResign,
  sendRestart,
  sendResume,
  disconnectWebSocket,
  isConnected,
} from '../services/ws/gomokuSocket.js'

const BOARD_SIZE = 15
const EMPTY_BOARD = Array(BOARD_SIZE)
  .fill(null)
  .map(() => Array(BOARD_SIZE).fill(null))

export function useGomokuGame({ roomId, onForbidden, onMessage }) {
  const [board, setBoard] = useState(EMPTY_BOARD)
  const [lastMove, setLastMove] = useState(null)
  const [winLines, setWinLines] = useState(new Set())
  const [sideToMove, setSideToMove] = useState('X')
  const [roundInfo, setRoundInfo] = useState({ round: 1, current: 'X' })
  const [scoreInfo, setScoreInfo] = useState({ black: 0, white: 0, draws: 0 })
  const [gameStatus, setGameStatus] = useState('PLAYING')
  const [mySide, setMySide] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [systemLogs, setSystemLogs] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [wsConnected, setWsConnected] = useState(false)

  const roomRef = useRef(roomId)
  const seatKeyRef = useRef(null)

  // 更新 roomId ref
  useEffect(() => {
    roomRef.current = roomId
  }, [roomId])

  // WebSocket 连接管理
  useEffect(() => {
    if (!roomId) {
      return
    }

    let mounted = true
    let checkInterval = null

    const handleConnect = () => {
      if (!mounted) return
      setWsConnected(true)

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

      // 订阅完整同步
      subscribeFullSync((snap) => {
        if (!mounted) return
        handleFullSync(snap)
      })

      // 发送恢复请求
      sendResume(roomId, seatKeyRef.current)
    }

    const handleDisconnect = () => {
      if (!mounted) return
      setWsConnected(false)
    }

    const handleError = (error) => {
      if (!mounted) return
      console.error('WebSocket 错误', error)
      setWsConnected(false)
      onMessage?.('连接失败，请刷新页面重试', 'error')
    }

    // 连接 WebSocket
    connectWebSocket({
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
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
      disconnectWebSocket()
    }
  }, [roomId, onMessage])

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
          if (value && value !== '.') {
            next[x][y] = String(value).toUpperCase()
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
          if (char && char !== '.') {
            next[i][j] = char.toUpperCase()
          }
        }
      }
      return next
    }

    return null
  }, [])

  // 更新游戏状态
  const updateGameState = useCallback((state) => {
    if (!state) return

    // 更新棋盘
    if (state.board) {
      const boardFromState = buildBoardFromPayload(state.board)
      if (boardFromState) {
        setBoard(boardFromState)
      }
    }

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
    } else {
      setWinLines(new Set())
    }

    // 更新当前回合
    if (state.current) {
      setSideToMove(state.current.toUpperCase())
    }

    // 更新游戏状态
    if (state.over !== undefined) {
      setGameStatus({
        over: Boolean(state.over),
        winner: state.winner || null,
        label: state.over ? 'Finished' : 'Playing',
      })
    }

    // 更新回合信息
    if (state.index !== undefined) {
      setRoundInfo((prev) => ({
        ...prev,
        round: state.index || 1,
        current: state.current || 'X',
      }))
    }
  }, [buildBoardFromPayload])

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
  const handleFullSync = useCallback(
    (snap) => {
      if (!snap) {
        return
      }
      if (snap.state) {
        updateGameState(snap.state)
      } else if (snap.cells) {
        const boardFromCells = buildBoardFromPayload(snap.cells)
        if (boardFromCells) {
          setBoard(boardFromCells)
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
      }
      if (snap.series) {
        updateSeriesInfo(snap.series)
      }
      if (snap.seatKey) {
        seatKeyRef.current = snap.seatKey
      }
      if (snap.side) {
        setMySide(snap.side)
      } else if (snap.mySide) {
        setMySide(snap.mySide)
      }
    },
    [buildBoardFromPayload, updateGameState, updateSeriesInfo, scoreInfo.black, scoreInfo.white],
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

      const cell = event.currentTarget
      const x = parseInt(cell.dataset.x, 10)
      const y = parseInt(cell.dataset.y, 10)

      if (isNaN(x) || isNaN(y)) {
        return
      }

      if (board[x][y] !== null) {
        return
      }

      if (gameStatus !== 'PLAYING') {
        return
      }

      if (mySide && sideToMove !== mySide) {
        onMessage?.('不是你的回合', 'error')
        return
      }

      if (roomRef.current) {
        try {
          sendPlace(roomRef.current, x, y, sideToMove, seatKeyRef.current)
          // 乐观更新：立即更新本地棋盘（如果发送失败，服务器会同步正确状态）
          setBoard((prev) => {
            const newBoard = prev.map((row) => [...row])
            newBoard[x][y] = sideToMove
            return newBoard
          })
          setLastMove({ x, y })
          setSideToMove((s) => (s === 'X' ? 'O' : 'X'))
        } catch (error) {
          console.error('发送落子指令失败', error)
          onMessage?.('落子失败，请检查网络连接后重试。', 'error')
        }
      }
    },
    [board, sideToMove, mySide, gameStatus, wsConnected, onMessage],
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
        console.error('发送认输指令失败', error)
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
        console.error('发送重开指令失败', error)
        onMessage?.('重开失败，请检查网络连接后重试。', 'error')
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
    placeStone,
    requestResign,
    requestRestart,
  }
}
