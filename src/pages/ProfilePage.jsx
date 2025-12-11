import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getCurrentUserProfile } from '../services/api/userApi.js'
import ProfileHome from '../components/profile/ProfileHome.jsx'
import ProfileEdit from '../components/profile/ProfileEdit.jsx'
import '../styles/profile.css'

const ProfilePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: authUser, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  const isEditMode = searchParams.get('mode') === 'edit'

  // 加载用户信息
  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    try {
      setLoading(true)
      setError(null)
      const profile = await getCurrentUserProfile()
      if (profile) {
        setUser(profile)
      }
    } catch (error) {
      setError('加载用户信息失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    navigate('/profile?mode=edit')
  }

  const handleCancel = () => {
    navigate('/profile')
  }

  const handleSave = async () => {
    // 编辑页面保存后，刷新数据并返回主页
    await loadUserProfile()
    await refreshUser()
    navigate('/profile')
  }

  if (loading) {
    return (
      <section className="page profile-page">
        <div className="profile-loading">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </section>
    )
  }

  if (error && !user) {
    return (
      <section className="page profile-page">
        <div className="profile-container">
          <div className="profile-error">
            <p>{error}</p>
            <button onClick={loadUserProfile} className="profile-retry-btn">
              重试
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page profile-page">
      {isEditMode ? (
        <ProfileEdit
          user={user}
          onSave={handleSave}
          onCancel={handleCancel}
          onRefresh={loadUserProfile}
        />
      ) : (
        <ProfileHome
          user={user}
          onEdit={handleEdit}
        />
      )}
    </section>
  )
}

export default ProfilePage
