const TOKEN_STORAGE_KEY = 'access_token'
const GATEWAY_LOGIN_URL = '/oauth2/authorization/keycloak'
const GATEWAY_TOKEN_URL = '/token'
const AUTH_REDIRECT_HEADER = 'X-Auth-Redirect-To'
const AUTH_MODAL_ID = 'auth-expired-modal'

let sessionLoggingOut = false

const isBrowser = typeof window !== 'undefined'

function ensureAuthModalMounted() {
  if (!isBrowser || document.getElementById(AUTH_MODAL_ID)) {
    return
  }

  const modal = document.createElement('div')
  modal.id = AUTH_MODAL_ID
  modal.innerHTML = `
        <style>
            .auth-modal-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(255, 245, 243, 0.85);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                visibility: hidden;
                opacity: 0;
                transition: opacity .25s ease;
                backdrop-filter: blur(6px);
            }
            .auth-modal-card {
                width: 380px;
                border-radius: 20px;
                padding: 28px 32px;
                background: linear-gradient(135deg, #fff8f6 0%, #ffe3de 100%);
                box-shadow: 0 20px 45px rgba(255, 132, 132, 0.25);
                text-align: center;
                font-family: "Helvetica Neue", "PingFang SC", sans-serif;
                color: #682d2d;
            }
            .auth-modal-card h3 {
                margin: 0 0 10px;
                font-size: 20px;
                color: #ff6a94;
            }
            .auth-modal-card p {
                margin: 0 0 22px;
                line-height: 1.5;
                color: #9b6c6c;
            }
            .auth-modal-actions {
                display: flex;
                gap: 14px;
                justify-content: center;
            }
            .auth-modal-btn {
                flex: 1;
                padding: 12px 0;
                border-radius: 999px;
                border: none;
                font-size: 15px;
                cursor: pointer;
                transition: transform .15s, box-shadow .15s;
            }
            .auth-modal-btn.primary {
                background: linear-gradient(120deg, #ff8db2, #ff6b74);
                color: #fff;
                box-shadow: 0 10px 20px rgba(255, 118, 148, 0.35);
            }
            .auth-modal-btn.secondary {
                background: #fff;
                color: #ff8db2;
                border: 2px solid rgba(255, 141, 178, 0.3);
            }
            .auth-modal-btn:hover {
                transform: translateY(-1px);
            }
        </style>
        <div class="auth-modal-backdrop">
            <div class="auth-modal-card">
                <h3>登录状态失效</h3>
                <p>很抱歉，您的登录已过期或被其他设备挤下线，请重新登录后继续。</p>
                <div class="auth-modal-actions">
                    <button id="auth-modal-retry" class="auth-modal-btn primary">重新登录</button>
                    <button id="auth-modal-cancel" class="auth-modal-btn secondary">稍后</button>
                </div>
            </div>
        </div>
    `
  document.body.appendChild(modal)

  const backdrop = modal.querySelector('.auth-modal-backdrop')
  const retryBtn = modal.querySelector('#auth-modal-retry')
  const cancelBtn = modal.querySelector('#auth-modal-cancel')

  retryBtn.addEventListener('click', () => {
    hideAuthModal()
    if (isBrowser) {
      window.location.href = `${GATEWAY_LOGIN_URL}?redirect_uri=${encodeURIComponent(window.location.href)}`
    }
  })

  cancelBtn.addEventListener('click', () => {
    hideAuthModal()
  })

  modal.showAuthModal = () => {
    sessionLoggingOut = true
    backdrop.style.visibility = 'visible'
    backdrop.style.opacity = '1'
  }

  modal.hideAuthModal = () => {
    backdrop.style.opacity = '0'
    backdrop.style.visibility = 'hidden'
  }
}

export function showAuthModal(message) {
  if (!isBrowser) {
    return
  }
  ensureAuthModalMounted()
  const modal = document.getElementById(AUTH_MODAL_ID)
  if (!modal) {
    return
  }
  const text = modal.querySelector('p')
  if (text) {
    text.textContent = message || '会话已失效，请重新登录。'
  }
  modal.showAuthModal()
}

export function hideAuthModal() {
  if (!isBrowser) {
    return
  }
  const modal = document.getElementById(AUTH_MODAL_ID)
  if (modal && typeof modal.hideAuthModal === 'function') {
    modal.hideAuthModal()
  }
  sessionLoggingOut = false
}

export function performSessionLogout(reason = '') {
  if (sessionLoggingOut) {
    return
  }
  sessionLoggingOut = true
  clearToken()
  showAuthModal(reason || '会话已失效，请点击“重新登录”再次进入游戏。')
}

export function handleAuthExpiredResponse(res, context) {
  if (!res) {
    return
  }
  if (typeof res.headers?.get === 'function') {
    const redirect = res.headers.get(AUTH_REDIRECT_HEADER)
    if (redirect) {
      showAuthModal('登录状态已过期，请重新登录。')
      return
    }
  }
  performSessionLogout(context)
}

export function handleFetchFailure(error, context) {
  console.error(context || 'fetch error', error)
  performSessionLogout(context || 'fetch error')
}

export async function getTokenFromGateway() {
  if (!isBrowser) {
    return null
  }
  try {
    const res = await fetch(GATEWAY_TOKEN_URL, {
      credentials: 'include',
    })

    if (!res.ok) {
      if (res.status === 401) {
        handleAuthExpiredResponse(res, 'GET /token 返回 401')
        return null
      }
      throw new Error(`获取 token 失败 (HTTP ${res.status})`)
    }

    const data = await res.json()
    const token = data?.access_token
    if (!token) {
      throw new Error('Gateway 返回的 token 为空')
    }

    saveToken(token)
    return token
  } catch (error) {
    handleFetchFailure(error, '从 Gateway 获取 token 失败')
    return null
  }
}

export async function initAndLogin() {
  if (!isBrowser) {
    return null
  }
  let token = await getTokenFromGateway()
  if (token) {
    sessionLoggingOut = false
    return token
  }

  const currentUrl = window.location.href
  window.location.href = `${GATEWAY_LOGIN_URL}?redirect_uri=${encodeURIComponent(currentUrl)}`
  throw new Error('正在跳转到登录页面...')
}

export function getToken() {
  if (!isBrowser) {
    return null
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function saveToken(token) {
  if (!isBrowser) {
    return
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  sessionLoggingOut = false
}

export function clearToken() {
  if (!isBrowser) {
    return
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export async function validateToken(token) {
  if (!token) {
    return false
  }
  try {
    const res = await fetch('/game-service/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (res.status === 401) {
      handleAuthExpiredResponse(res, '/game-service/me 返回 401 (validateToken)')
      return false
    }

    return res.ok
  } catch (error) {
    console.error('validateToken error', error)
    return false
  }
}

export async function ensureAuthenticated() {
  let token = await getTokenFromGateway()
  if (token) {
    const isValid = await validateToken(token)
    if (isValid) {
      return token
    }
    clearToken()
  }

  token = getToken()
  if (token) {
    const isValid = await validateToken(token)
    if (isValid) {
      return token
    }
    clearToken()
  }

  token = await initAndLogin()
  return token
}

export async function getUserInfo() {
  const token = getToken()
  if (!token) {
    return null
  }

  const profile = await fetchSystemUserProfile(token)
  if (profile) {
    return profile
  }

  return await fetchGatewayUserProfile(token)
}

async function fetchSystemUserProfile(token) {
  try {
    const res = await fetch('/system-service/api/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (res.status === 401) {
      handleAuthExpiredResponse(res, '/system-service/api/users/me 返回 401')
      return null
    }

    if (!res.ok) {
      return null
    }

    const body = await res.json()
    const data = body?.data || body
    if (data) {
      if (!data.nickname && data.username) {
        data.nickname = data.username
      }
      return data
    }
  } catch (error) {
    console.error('fetchSystemUserProfile error', error)
  }
  return null
}

async function fetchGatewayUserProfile(token) {
  try {
    const res = await fetch('/game-service/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (res.status === 401) {
      handleAuthExpiredResponse(res, '/game-service/me 返回 401 (fallback)')
      return null
    }

    if (!res.ok) {
      return null
    }

    const profile = await res.json()
    if (profile && !profile.nickname && profile.username) {
      profile.nickname = profile.username
    }
    return profile
  } catch (error) {
    console.error('fetchGatewayUserProfile error', error)
    return null
  }
}

