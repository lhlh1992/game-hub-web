import { useEffect, useMemo, useState } from 'react'
import { USE_MOCK_AUTH } from '../config/appConfig.js'
import { ensureAuthenticated, getUserInfo } from '../services/auth/authService.js'

export function useAuth() {
  const mockUser = USE_MOCK_AUTH ? { nickname: '开发者', username: 'dev' } : null
  const [state, setState] = useState({
    isAuthenticated: USE_MOCK_AUTH,
    isLoading: !USE_MOCK_AUTH,
    user: mockUser,
    error: null,
  })

  useEffect(() => {
    if (USE_MOCK_AUTH) {
      return
    }

    let mounted = true

    const run = async () => {
      try {
        const token = await ensureAuthenticated()
        if (!mounted) {
          return
        }
        if (!token) {
          setState({ isAuthenticated: false, isLoading: false, user: null, error: null })
          return
        }

        const profile = await getUserInfo()
        if (!mounted) {
          return
        }
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: profile,
          error: null,
        })
      } catch (error) {
        if (!mounted) {
          return
        }
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error,
        })
      }
    }

    run()

    return () => {
      mounted = false
    }
  }, [])

  return useMemo(() => state, [state])
}

