# Token 刷新测试指南

## 🎯 如何验证 Token 刷新是否正常工作

### 方法 1：等待自动刷新（最简单）

1. **登录后，查看控制台**
   - 应该能看到：`Token expires in 120 s`（token 120 秒后过期）

2. **等待 2 分钟（120 秒）**
   - 不要刷新页面
   - 不要关闭浏览器标签

3. **观察控制台**
   - 如果 token 刷新成功，应该能看到：
     - `Token 即将过期，自动刷新...`
     - `Token 刷新成功`
   - 如果刷新失败，应该能看到：
     - `Token 刷新失败: ...`
     - 可能会自动跳转到登录页

4. **刷新页面（F5）**
   - 如果仍然显示头像（不是"登录"按钮），说明 token 刷新成功 ✅
   - 如果跳转到登录页，说明 token 刷新失败 ❌

---

### 方法 2：在控制台手动测试（推荐）

打开浏览器控制台（F12），运行以下代码：

#### 步骤 1：检查当前 token 状态

```javascript
// 导入 keycloak 实例（需要先确保已初始化）
import keycloak from './src/config/keycloak.js'

// 或者直接在控制台访问（如果已经全局暴露）
// 检查 token 是否存在
console.log('Token 是否存在:', !!keycloak.token)
console.log('Token 内容:', keycloak.token ? keycloak.token.substring(0, 50) + '...' : 'null')

// 检查 token 过期时间
if (keycloak.tokenParsed) {
  const expiresAt = keycloak.tokenParsed.exp * 1000  // 转换为毫秒
  const now = Date.now()
  const expiresIn = Math.floor((expiresAt - now) / 1000)  // 剩余秒数
  console.log('Token 过期时间:', new Date(expiresAt).toLocaleString())
  console.log('Token 剩余时间:', expiresIn, '秒')
}
```

#### 步骤 2：手动触发 token 刷新

```javascript
// 手动刷新 token（提前 30 秒刷新）
keycloak.updateToken(30)
  .then((refreshed) => {
    if (refreshed) {
      console.log('✅ Token 刷新成功！')
      console.log('新 Token:', keycloak.token ? keycloak.token.substring(0, 50) + '...' : 'null')
    } else {
      console.log('ℹ️ Token 仍在有效期内，无需刷新')
    }
  })
  .catch((err) => {
    console.error('❌ Token 刷新失败:', err)
  })
```

#### 步骤 3：检查刷新后的 token

```javascript
// 检查刷新后的 token 过期时间
if (keycloak.tokenParsed) {
  const expiresAt = keycloak.tokenParsed.exp * 1000
  const now = Date.now()
  const expiresIn = Math.floor((expiresAt - now) / 1000)
  console.log('刷新后 Token 过期时间:', new Date(expiresAt).toLocaleString())
  console.log('刷新后 Token 剩余时间:', expiresIn, '秒')
}
```

---

### 方法 3：添加测试按钮（开发环境）

在开发环境中，可以添加一个测试按钮来验证 token 刷新。

#### 在 `Header.jsx` 中添加测试按钮（仅开发环境）

```javascript
// 在 Header 组件中添加（仅开发环境）
{process.env.NODE_ENV === 'development' && (
  <button
    onClick={async () => {
      try {
        const refreshed = await keycloak.updateToken(30)
        if (refreshed) {
          alert('✅ Token 刷新成功！')
        } else {
          alert('ℹ️ Token 仍在有效期内')
        }
      } catch (err) {
        alert('❌ Token 刷新失败: ' + err.message)
      }
    }}
    style={{ marginLeft: '10px', padding: '5px 10px' }}
  >
    测试 Token 刷新
  </button>
)}
```

---

### 方法 4：监控 token 刷新事件

在 `AuthContext.jsx` 中，已经有 `onTokenExpired` 事件监听器。你可以添加更多日志来监控：

```javascript
keycloak.onTokenExpired = () => {
  console.log('⏰ Token 即将过期，自动刷新...')
  const beforeRefresh = Date.now()
  
  keycloak
    .updateToken(30)
    .then((refreshed) => {
      const afterRefresh = Date.now()
      if (refreshed) {
        console.log('✅ Token 刷新成功！耗时:', afterRefresh - beforeRefresh, 'ms')
        console.log('新 Token 过期时间:', new Date(keycloak.tokenParsed.exp * 1000).toLocaleString())
      } else {
        console.warn('⚠️ Token 刷新失败，但仍在有效期内')
      }
    })
    .catch((err) => {
      console.error('❌ Token 刷新失败:', err)
      console.error('错误详情:', err.message, err.stack)
      keycloak.login()
    })
}
```

---

## 🔍 验证 Token 刷新是否正常

### ✅ 正常情况

1. **自动刷新成功**
   - 控制台显示：`Token 即将过期，自动刷新...`
   - 控制台显示：`Token 刷新成功`
   - 页面不跳转到登录页
   - 右上角仍然显示头像（不是"登录"按钮）

2. **手动刷新成功**
   - `keycloak.updateToken(30)` 返回 `Promise<true>`
   - 新的 token 过期时间延长了（比如又增加了 120 秒）

### ❌ 异常情况

1. **自动刷新失败**
   - 控制台显示：`Token 刷新失败: ...`
   - 自动跳转到 Keycloak 登录页
   - 或者页面显示"登录"按钮

2. **手动刷新失败**
   - `keycloak.updateToken(30)` 抛出错误
   - 错误信息可能包含：
     - `NetworkError`
     - `401 Unauthorized`
     - `realmUrl is undefined`

---

## 🐛 如果 Token 刷新失败怎么办？

### 问题 1：`realmUrl is undefined`

**症状**：
- 控制台显示：`realmUrl: undefined`
- Token 刷新失败

**解决方案**：
- 检查 `keycloak.js` 配置是否正确`
- 确认 `url` 和 `realm` 配置正确
- 虽然 `realmUrl` 是 `undefined`，但 keycloak-js 内部应该仍然能工作

### 问题 2：`401 Unauthorized`

**症状**：
- Token 刷新时返回 401 错误

**可能原因**：
- Keycloak 客户端配置不正确（Access Type 应该是 `public`）
- 重定向 URI 不匹配
- Token 已过期且 refresh token 也过期

**解决方案**：
- 检查 Keycloak 客户端配置（参考 `KEYCLOAK_CLIENT_CHECKLIST.md`）
- 重新登录获取新的 token

### 问题 3：`NetworkError`

**症状**：
- Token 刷新时网络错误

**可能原因**：
- Keycloak 服务器未运行
- 网络连接问题
- CORS 配置问题

**解决方案**：
- 确认 Keycloak 服务器正在运行：`http://127.0.0.1:8180`
- 检查浏览器网络面板，查看具体错误

---

## 📊 测试检查清单

- [ ] 登录后，控制台显示 token 过期时间（如：`Token expires in 120 s`）
- [ ] 等待 2 分钟后，控制台显示自动刷新日志
- [ ] 刷新页面后，仍然显示头像（不是"登录"按钮）
- [ ] 手动调用 `keycloak.updateToken(30)` 成功
- [ ] 刷新后的 token 过期时间延长了
- [ ] 没有出现 `401 Unauthorized` 错误
- [ ] 没有出现 `realmUrl is undefined` 导致的刷新失败

---

## 💡 快速测试命令

在浏览器控制台中，运行以下代码进行快速测试：

```javascript
// 快速测试 token 刷新
(async () => {
  try {
    console.log('开始测试 token 刷新...')
    const refreshed = await keycloak.updateToken(30)
    if (refreshed) {
      console.log('✅ Token 刷新成功！')
    } else {
      console.log('ℹ️ Token 仍在有效期内')
    }
    console.log('Token 是否存在:', !!keycloak.token)
    if (keycloak.tokenParsed) {
      const expiresAt = keycloak.tokenParsed.exp * 1000
      const expiresIn = Math.floor((expiresAt - Date.now()) / 1000)
      console.log('Token 剩余时间:', expiresIn, '秒')
    }
  } catch (err) {
    console.error('❌ Token 刷新失败:', err)
  }
})()
```

---

**最后更新**：2025-01-XX








