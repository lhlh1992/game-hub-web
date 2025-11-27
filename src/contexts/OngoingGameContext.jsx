import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getOngoingGame } from '../services/api/gameApi.js'

const OngoingGameContext = createContext({
  loading: true,
  data: null,
  error: null,
  refresh: () => {},
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

  const contextValue = useMemo(
    () => ({
      loading: state.loading,
      data: state.data,
      error: state.error,
      refresh: fetchOngoingGame,
    }),
    [state, fetchOngoingGame],
  )

  return <OngoingGameContext.Provider value={contextValue}>{children}</OngoingGameContext.Provider>
}

export const useOngoingGameContext = () => useContext(OngoingGameContext)

export default OngoingGameContext

