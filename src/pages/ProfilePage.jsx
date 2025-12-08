import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { getCurrentUserProfile, updateUserProfile, uploadAvatarToTemp } from '../services/api/userApi.js'
import '../styles/profile.css'

const DEFAULT_AVATAR = '/images/avatar-default.png'

const ProfilePage = () => {
  const { user: authUser, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    phone: '',
    bio: '',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai'
  })
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [tempAvatarUrl, setTempAvatarUrl] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null) // 本地预览，确保上传后立即显示
  const [displayUrl, setDisplayUrl] = useState(DEFAULT_AVATAR) // 展示用（带缓存穿透）
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [toast, setToast] = useState(null) // {type: 'success'|'error', message: string}
  const fileInputRef = useRef(null)

  // 加载用户信息
  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    try {
      setLoading(true)
      const profile = await getCurrentUserProfile()
      if (profile) {
        setUser(profile)
        setFormData({
          nickname: profile.nickname || '',
          email: profile.email || '',
          phone: profile.phone || '',
          bio: profile.bio || '',
          locale: profile.locale || 'zh-CN',
          timezone: profile.timezone || 'Asia/Shanghai'
        })
        setAvatarUrl(profile.avatarUrl || null)
      }
    } catch (error) {
      console.error('加载用户信息失败', error)
      setError('加载用户信息失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 处理头像选择
  const handleAvatarSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }

    // 验证文件大小（2MB）
    if (file.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      // 先本地预览，避免因远端可见性/延迟导致不显示
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      const localPreview = URL.createObjectURL(file)
      setPreviewUrl(localPreview)

      // 上传到临时目录
      const tempUrl = await uploadAvatarToTemp(file)
      setTempAvatarUrl(tempUrl)
      setSuccess('头像上传成功，点击保存按钮确认更新')
      setToast({ type: 'success', message: '头像已上传（待保存确认）' })
    } catch (error) {
      console.error('上传头像失败', error)
      setError('上传头像失败: ' + error.message)
      setToast({ type: 'error', message: '上传失败：' + error.message })
    }
  }

  // 处理表单提交
  const handleSubmit = async (event) => {
    event.preventDefault()
    
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const updateData = {
        ...formData,
        avatarUrl: tempAvatarUrl || avatarUrl // 如果有临时头像，使用临时头像；否则保持原头像
      }

      const updatedUser = await updateUserProfile(updateData)
      
      // 更新本地状态
      setUser(updatedUser)
      setAvatarUrl(updatedUser.avatarUrl)
      setPreviewUrl(updatedUser.avatarUrl || previewUrl || tempAvatarUrl || avatarUrl || null)
      setTempAvatarUrl(null) // 清空临时头像
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(null)
      
      // 刷新全局用户信息
      await refreshUser()
      
      setSuccess('资料更新成功！')
      setToast({ type: 'success', message: '资料已更新' })
      
      // 清空文件选择
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('更新资料失败', error)
      setError('更新资料失败: ' + error.message)
      setToast({ type: 'error', message: '更新失败：' + error.message })
    } finally {
      setSaving(false)
    }
  }

  // 处理输入变化
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const displayAvatarUrl = previewUrl || tempAvatarUrl || avatarUrl || DEFAULT_AVATAR

  // 根据当前可用的头像 URL 生成展示 URL，并附加时间戳避免缓存
  useEffect(() => {
    if (previewUrl) {
      setDisplayUrl(previewUrl)
      return
    }
    const base = tempAvatarUrl || avatarUrl
    if (base) {
      const withTs = `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`
      setDisplayUrl(withTs)
    } else {
      setDisplayUrl(DEFAULT_AVATAR)
    }
  }, [previewUrl, tempAvatarUrl, avatarUrl])

  // 自动清理 toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

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

  return (
    <section className="page profile-page">
      <div className="profile-container">
        {toast && (
          <div className={`toast ${toast.type === 'success' ? 'toast--success' : 'toast--error'}`}>
            {toast.message}
          </div>
        )}
        <div className="profile-header">
          <h1 className="profile-title">完善个人信息</h1>
          <p className="profile-subtitle">完善您的个人资料，让其他玩家更好地了解您</p>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          {/* 头像上传区域 */}
          <div className="profile-section">
            <label className="profile-section-label">头像</label>
            <div className="avatar-upload-area">
              <div 
                className="avatar-preview" 
                style={{ backgroundImage: `url('${displayUrl}')` }}
              >
                {tempAvatarUrl && (
                  <div className="avatar-badge">新</div>
                )}
              </div>
              <div className="avatar-upload-controls">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleAvatarSelect}
                  className="avatar-file-input"
                  id="avatar-input"
                />
                <label htmlFor="avatar-input" className="avatar-upload-btn">
                  选择图片
                </label>
                <p className="avatar-hint">支持 JPG、PNG、GIF、WEBP，最大 2MB</p>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="profile-section">
            <label className="profile-section-label">基本信息</label>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="nickname">昵称</label>
                <input
                  id="nickname"
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => handleInputChange('nickname', e.target.value)}
                  placeholder="请输入昵称"
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">邮箱</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="请输入邮箱"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">手机号</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="请输入手机号"
                  maxLength={20}
                />
              </div>
            </div>
          </div>

          {/* 个人简介 */}
          <div className="profile-section">
            <label className="profile-section-label">个人简介</label>
            <div className="form-group">
              <textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                placeholder="介绍一下自己吧..."
                maxLength={500}
                rows={4}
              />
              <div className="form-hint">{formData.bio.length}/500</div>
            </div>
          </div>

          {/* 偏好设置 */}
          <div className="profile-section">
            <label className="profile-section-label">偏好设置</label>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="locale">语言偏好</label>
                <select
                  id="locale"
                  value={formData.locale}
                  onChange={(e) => handleInputChange('locale', e.target.value)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁体中文</option>
                  <option value="en-US">English</option>
                  <option value="ja-JP">日本語</option>
                  <option value="ko-KR">한국어</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="timezone">时区</label>
                <select
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => handleInputChange('timezone', e.target.value)}
                >
                  <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                  <option value="Asia/Seoul">Asia/Seoul (UTC+9)</option>
                  <option value="America/New_York">America/New_York (UTC-5)</option>
                  <option value="Europe/London">Europe/London (UTC+0)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>

          {/* 消息提示 */}
          {error && (
            <div className="profile-message profile-message--error">
              {error}
            </div>
          )}
          {success && (
            <div className="profile-message profile-message--success">
              {success}
            </div>
          )}

          {/* 提交按钮 */}
          <div className="profile-actions">
            <button 
              type="submit" 
              className="profile-submit-btn"
              disabled={saving}
            >
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

export default ProfilePage
