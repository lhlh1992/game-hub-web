import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  connectWebSocket,
  subscribeRoom,
  subscribeFullSync,
  subscribeSeatKey,
  sendResume,
  sendPlace as wsSendPlace,
  sendResign,
  sendRestart,
  disconnectWebSocket,
  isConnected,
} from '../services/ws/gomokuSocket.js'

const BOARD_SIZE = 15

function normalizeGrid(raw) {
  if (!raw) {
    return null
  }
  let gridSource = raw
  if (Array.isArray(raw.grid)) {
    gridSource = raw.grid
  } else if (Array.isArray(raw.cells)) {
    gridSource = raw.cells
  }
  if (Array.isArray(gridSource) && typeof gridSource[0] === 'string') {
    return gridSource.map((row) => row.split(''))
  }
  if (Array.isArray(gridSource) && Array.isArray(gridSource[0])) {
    return gridSource.map((row) => [...row])
  }
  return null
}

function makeEmptyGrid(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill('.'))
}

function saveSeatKey(roomId, side, key) {
  if (!roomId || !side || !key) {
    return
  }
  try {
    localStorage.setItem(`room:${roomId}:seatKey:${side}`, key)
    sessionStorage.setItem(`room:${roomId}:currentSeatKey`, key)
  } catch (error) {
    console.warn('保存 seatKey 失败', error)
  }
}

function getSeatKey(roomId) {
  if (!roomId) {
    return null
  }
  try {
    const cached = sessionStorage.getItem(`room:${roomId}:currentSeatKey`)
    if (cached) {
      return cached
    }
    const seatX = localStorage.getItem(`room:${roomId}:seatKey:X`)
    const seatO = localStorage.getItem(`room:${roomId}:seatKey:O`)
    const fallback = seatX || seatO
    if (fallback) {
      sessionStorage.setItem(`room:${roomId}:currentSeatKey`, fallback)
    }
    return fallback
  } catch (error) {
    console.warn('读取 seatKey 失败', error)
    return null
  }
}

function detectWinLines(grid, winnerPiece) {
  if (!grid || !winnerPiece) {
    return new Set()
  }
  const normalizedWinner = winnerPiece.toUpperCase()
  const n = grid.length
  const winPieces = new Set()
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (let x = 0; x < n; x += 1) {
    for (let y = 0; y < n; y += 1) {
      const val = grid[x][y]
      const matches =
        (normalizedWinner === 'X' && (val === 'X' || val === 'x' || val === 0 || val === '0')) ||
        (normalizedWinner === 'O' && (val === 'O' || val === 'o' || val === 1 || val === '1'))
      if (!matches) {
        continue
      }
      dirs.forEach(([dx, dy]) => {
        const line = [[x, y]]
        let cx = x + dx
        let cy = y + dy
        while (cx >= 0 && cx < n && cy >= 0 && cy < n && grid[cx][cy] === val) {
          line.push([cx, cy])
          cx += dx
          cy += dy
        }
        cx = x - dx
        cy = y - dy
        while (cx >= 0 && cx < n && cy >= 0 && cy < n && grid[cx][cy] === val) {
          line.unshift([cx, cy])
          cx -= dx
          cy -= dy
        }
        if (line.length >= 5) {
          line.slice(0, 5).forEach(([lx, ly]) => winPieces.add(`${lx},${ly}`))
        }
      })
    }
  }
  return winPieces
}

export function useGomokuGame({ roomId, onForbidden } = {}) {
  const [board, setBoard] = useState(() => makeEmptyGrid())
  const [lastMove, setLastMove] = useState(null)
  const [winLines, setWinLines] = useState(() => new Set())
  const [sideToMove, setSideToMove] = useState('X')
  const [scoreInfo, setScoreInfo] = useState({ black: 0, white: 0 })
  const [roundInfo, setRoundInfo] = useState({ round: 1 })
  const [gameStatus, setGameStatus] = useState({ label: 'Playing', over: false })
  const [mySide, setMySide] = useState(null)
  const [countdown, setCountdown] = useState({ side: null, seconds: 0 })
  const [systemLogs, setSystemLogs] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const seatKeyRef = useRef(null)
  const roomRef = useRef(roomId)
  const countdownTimerRef = useRef(null)
  const countdownDeadlineRef = useRef(0)
  const chatRef = useRef([])
  const logRef = useRef([])
  const wsCheckIntervalRef = useRef(null)

  useEffect(() => {
    roomRef.current = roomId
    seatKeyRef.current = getSeatKey(roomId)
  }, [roomId])

  const stopCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    countdownDeadlineRef.current = 0
    setCountdown({ side: null, seconds: 0 })
  }, [])

  const updateCountdownFromDeadline = useCallback(() => {
    if (!countdownDeadlineRef.current) {
      return
    }
    const remainingMs = Math.max(0, countdownDeadlineRef.current - Date.now())
    const seconds = Math.ceil(remainingMs / 1000)
    setCountdown((prev) => ({
      side: prev.side,
      seconds,
    }))
    if (seconds <= 0) {
      stopCountdown()
    }
  }, [stopCountdown])

  const startCountdownFromDeadline = useCallback(
    (deadlineMs, sideHint) => {
      if (!deadlineMs) {
        stopCountdown()
        return
      }
      countdownDeadlineRef.current = deadlineMs
      const nextSide = (sideHint || sideToMove || 'X').toUpperCase()
      setCountdown({
        side: nextSide,
        seconds: Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)),
      })
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
      countdownTimerRef.current = setInterval(updateCountdownFromDeadline, 500)
    },
    [sideToMove, stopCountdown, updateCountdownFromDeadline],
  )

  const startCountdownFromSeconds = useCallback(
    (seconds, sideHint) => {
      if (!Number.isFinite(seconds)) {
        stopCountdown()
        return
      }
      startCountdownFromDeadline(Date.now() + seconds * 1000, sideHint)
    },
    [startCountdownFromDeadline, stopCountdown],
  )

  const placeStone = useCallback(
    (event) => {
      if (!event?.currentTarget) {
        return
      }
      const { x, y } = event.currentTarget.dataset
      const xi = Number(x)
      const yi = Number(y)
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) {
        return
      }
      
      // 检查WebSocket连接状态
      if (!wsConnected) {
        console.warn('WebSocket未连接，无法落子')
        alert('连接已断开，无法落子。请刷新页面重新连接。')
        return
      }
      
      // 先尝试发送，成功后再更新本地状态
      if (roomRef.current) {
        try {
          wsSendPlace(roomRef.current, xi, yi, sideToMove, seatKeyRef.current)
          // 发送成功后，乐观更新本地状态（服务器会通过WebSocket消息确认）
          setBoard((prev) => {
            if (prev[xi][yi] !== '.') {
              return prev
            }
            const next = prev.map((row) => [...row])
            next[xi][yi] = sideToMove
            setLastMove({ x: xi, y: yi })
            setSideToMove((s) => (s === 'X' ? 'O' : 'X'))
            return next
          })
        } catch (error) {
          console.error('发送落子指令失败', error)
          // 如果发送失败，回滚本地状态
          setBoard((prev) => {
            if (prev[xi][yi] === sideToMove) {
              const next = prev.map((row) => [...row])
              next[xi][yi] = '.'
              return next
            }
            return prev
          })
          alert('落子失败：' + (error.message || '连接已断开'))
        }
      }
    },
    [sideToMove, wsConnected],
  )

  const requestResign = useCallback(() => {
    if (!roomRef.current) {
      return
    }
    try {
      sendResign(roomRef.current, seatKeyRef.current)
    } catch (error) {
      console.error('发送认输失败', error)
    }
  }, [])

  const requestRestart = useCallback(() => {
    if (!roomRef.current) {
      return
    }
    try {
      sendRestart(roomRef.current, seatKeyRef.current)
    } catch (error) {
      console.error('发送重新开始失败', error)
    }
  }, [])

  const loadSnapshot = useCallback((snap) => {
    if (!snap) {
      return
    }
    const grid = normalizeGrid(snap.board?.cells ?? snap.board)
    if (grid) {
      setBoard(grid)
    } else {
      console.warn('[Gomoku] FullSync 缺少 board，跳过渲染', snap)
    }
    setLastMove(snap.lastMove || null)
    setSideToMove(snap.sideToMove === 'O' ? 'O' : 'X')
    if (snap.mySide) {
      setMySide(snap.mySide)
    }
    setScoreInfo({
      black: snap.seriesView?.scoreX ?? 0,
      white: snap.seriesView?.scoreO ?? 0,
    })
    setRoundInfo({
      round: snap.round ?? snap.seriesView?.round ?? 1,
    })
    if (snap.outcome === 'X_WIN' || snap.outcome === 'O_WIN') {
      const winnerPiece = snap.outcome === 'X_WIN' ? 'X' : 'O'
      setWinLines(detectWinLines(grid, winnerPiece))
      setGameStatus({ label: 'Ended', over: true, winner: winnerPiece })
      stopCountdown()
    } else {
      setWinLines(new Set())
      setGameStatus({ label: 'Playing', over: false })
      if (snap.deadlineEpochMs && snap.deadlineEpochMs > 0) {
        startCountdownFromDeadline(snap.deadlineEpochMs, snap.sideToMove)
      } else {
        stopCountdown()
      }
    }
  }, [startCountdownFromDeadline, stopCountdown])

  const loadSnapshotRef = useRef(loadSnapshot)
  useEffect(() => {
    loadSnapshotRef.current = loadSnapshot
  }, [loadSnapshot])

  const updateStateFromPayload = useCallback(
    (payload) => {
      if (!payload) {
        return
      }
      const nextGrid = normalizeGrid(payload.board)
      if (nextGrid) {
        setBoard(nextGrid)
      } else if (!payload.board) {
        console.warn('[Gomoku] payload 缺少 board，跳过渲染', payload)
      } else {
        console.warn('[Gomoku] board 数据格式未知，跳过渲染', payload.board)
      }
      if (payload.lastMove && Number.isFinite(payload.lastMove.x) && Number.isFinite(payload.lastMove.y)) {
        const moveSide =
          (payload.lastMove.side || payload.lastMove.piece || payload.lastMove.player || '').toString().toUpperCase() || 'X'
        setLastMove({ x: payload.lastMove.x, y: payload.lastMove.y })
      }
      if (payload.sideToMove) {
        setSideToMove(payload.sideToMove === 'O' ? 'O' : 'X')
      }
      if (payload.series) {
        setRoundInfo((prev) => ({ round: payload.series.index ?? prev.round }))
        setScoreInfo((prev) => ({
          black: payload.series.blackWins ?? prev.black,
          white: payload.series.whiteWins ?? prev.white,
        }))
      }
      if (payload.over || payload.outcome) {
        const winnerPiece =
          payload.winner ||
          (payload.outcome === 'X_WIN' ? 'X' : payload.outcome === 'O_WIN' ? 'O' : null)
        if (winnerPiece) {
          const gridSource = normalizeGrid(payload.board?.grid ?? payload.board ?? board)
          setWinLines(detectWinLines(gridSource, winnerPiece))
          setGameStatus({ label: 'Ended', over: true, winner: winnerPiece })
          stopCountdown()
        }
      } else {
        setWinLines(new Set())
        setGameStatus({ label: 'Playing', over: false })
        if (payload.deadlineEpochMs) {
          startCountdownFromDeadline(payload.deadlineEpochMs, payload.sideToMove || payload.current)
        } else if (typeof payload.left === 'number') {
          startCountdownFromSeconds(payload.left, payload.sideToMove || payload.current)
        }
      }
    },
    [board, startCountdownFromDeadline, startCountdownFromSeconds, stopCountdown],
  )

  const handleRoomEvent = useCallback(
    (evt) => {
      if (!evt) {
        return
      }
      if (evt.type === 'TICK') {
        const payload = evt.payload || {}
        if (typeof payload.deadlineEpochMs === 'number' && payload.deadlineEpochMs > 0) {
          startCountdownFromDeadline(payload.deadlineEpochMs, payload.side)
        } else if (typeof payload.left === 'number') {
          startCountdownFromSeconds(payload.left, payload.side)
        }
        return
      }
      if (evt.type === 'TIMEOUT') {
        stopCountdown()
        return
      }
      if (evt.type === 'SNAPSHOT') {
        loadSnapshot(evt.payload)
        return
      }
      if (evt.type === 'ERROR') {
        const message = evt.payload?.message || evt.payload || ''
        if (typeof message === 'string' && message.includes('禁手')) {
          onForbidden?.()
        }
        return
      }
      const payload = evt.payload || evt
      updateStateFromPayload(payload.state || payload)
    },
    [loadSnapshot, onForbidden, startCountdownFromDeadline, startCountdownFromSeconds, stopCountdown, updateStateFromPayload],
  )

  const handleRoomEventRef = useRef(handleRoomEvent)
  useEffect(() => {
    handleRoomEventRef.current = handleRoomEvent
  }, [handleRoomEvent])

  const stopCountdownRef = useRef(stopCountdown)
  useEffect(() => {
    stopCountdownRef.current = stopCountdown
  }, [stopCountdown])

  useEffect(() => {
    if (!roomId) {
      return undefined
    }
    let mounted = true
    const initConnection = async () => {
      try {
        // connectWebSocket 会自动从 Keycloak 获取 token
        await connectWebSocket({
          onConnect: () => {
            if (!mounted) return
            setWsConnected(true)
            subscribeSeatKey((seatKey, side) => {
              seatKeyRef.current = seatKey
              if (side) {
                saveSeatKey(roomId, side, seatKey)
                setMySide(side)
              }
            })
            subscribeFullSync((snap) => {
              if (!mounted) {
                return
              }
              loadSnapshotRef.current?.(snap)
            })
            subscribeRoom(roomId, (evt) => {
              if (!mounted) {
                return
              }
              handleRoomEventRef.current?.(evt)
            })
            sendResume(roomId, seatKeyRef.current)
          },
          onError: (error) => {
            console.error('WebSocket 错误', error)
            if (mounted) {
              setWsConnected(false)
            }
          },
          onDisconnect: () => {
            if (mounted) {
              setWsConnected(false)
            }
          },
        })
      } catch (error) {
        console.error('初始化实时连接失败', error)
        if (mounted) {
          setWsConnected(false)
        }
      }
    }
    initConnection()
    
    // 定期检查连接状态（作为兜底，每5秒检查一次，而不是每秒）
    wsCheckIntervalRef.current = setInterval(() => {
      if (mounted) {
        setWsConnected(isConnected())
      }
    }, 5000)
    
    return () => {
      mounted = false
      if (wsCheckIntervalRef.current) {
        clearInterval(wsCheckIntervalRef.current)
        wsCheckIntervalRef.current = null
      }
      disconnectWebSocket()
      setWsConnected(false)
      stopCountdownRef.current?.()
    }
  }, [roomId])

  return {
    board,
    lastMove,
    winLines,
    sideToMove,
    scoreInfo,
    roundInfo,
    gameStatus,
    mySide,
    countdown,
    systemLogs,
    chatMessages,
    wsConnected,
    placeStone,
    requestResign,
    requestRestart,
    loadSnapshot,
    appendSystemLog: (entry) => setSystemLogs((prev) => [...prev, entry]),
    appendChatMessage: (entry) => setChatMessages((prev) => [...prev, entry]),
  }
}

