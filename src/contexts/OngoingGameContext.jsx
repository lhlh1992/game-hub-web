import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { endOngoingGame, getOngoingGame } from '../services/api/gameApi.js'

const OngoingGameContext = createContext({
  loading: true,
  data: null,
  error: null,
  refresh: () => {},
  end: async () => {},
})

export const OngoingGameProvider = ({ children }) => {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  })

  const fetchOngoingGame = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const result = await getOngoingGame()
      if (result?.hasOngoing) {
        setState({ loading: false, data: result, error: null })
      } else {
        setState({ loading: false, data: null, error: null })
      }
    } catch (error) {
      console.error('[OngoingGame] 获取进行中对局失败', error)
      setState({ loading: false, data: null, error })
    }
  }, [])

  useEffect(() => {
    fetchOngoingGame()
  }, [fetchOngoingGame])

  const endCurrentGame = useCallback(
    async (roomId) => {
      try {
        await endOngoingGame(roomId)
      } catch (error) {
        console.error('[OngoingGame] 结束对局失败', error)
        setState((prev) => ({ ...prev, error }))
        throw error
      } finally {
        setState((prev) => ({ ...prev, data: null }))
      }
    },
    [],
  )

  const contextValue = useMemo(
    () => ({
      loading: state.loading,
      data: state.data,
      error: state.error,
      refresh: fetchOngoingGame,
      end: endCurrentGame,
    }),
    [state, fetchOngoingGame, endCurrentGame],
  )

  return <OngoingGameContext.Provider value={contextValue}>{children}</OngoingGameContext.Provider>
}

export const useOngoingGameContext = () => useContext(OngoingGameContext)

export default OngoingGameContext

