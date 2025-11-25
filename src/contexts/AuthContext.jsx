import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  ensureAuthenticated,
  getUserInfo,
  initAndLogin,
  logoutFromGateway,
} from '../services/auth/authService.js'

const AuthContext = createContext({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: () => {},
  logout: () => {},
  refreshUser: () => {},
})

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState(null)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const token = await ensureAuthenticated()
        if (!mounted) {
          return
        }
        if (token) {
          setIsAuthenticated(true)
          await loadUserProfile()
        } else {
          setIsAuthenticated(false)
        }
      } catch (error) {
        if (!mounted) {
          return
        }
        console.warn('初始化认证状态失败', error)
        setIsAuthenticated(false)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [])

  const loadUserProfile = useCallback(async () => {
    try {
      const profile = await getUserInfo()
      setUser(profile || null)
    } catch (error) {
      console.error('加载用户信息失败', error)
      setUser(null)
    }
  }, [])

  const login = useCallback(() => {
    initAndLogin().catch((error) => console.warn('跳转登录失败', error))
  }, [])

  const logout = useCallback(async () => {
    await logoutFromGateway()
  }, [])

  const value = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    refreshUser: loadUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

