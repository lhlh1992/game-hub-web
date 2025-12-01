# Keycloak-JS 工作原理详解

## 🤔 问题：前端是怎么知道 Keycloak 登录没登录的？

## 📋 答案：前端直接连接 Keycloak，通过多种机制检测登录状态

### 1. **前端确实直接连接 Keycloak**

```
前端 (localhost:5173)
    ↓ (直接连接，不经过 Gateway)
Keycloak (localhost:8180)
```

**关键点**：
- 前端使用 `keycloak-js` SDK 直接与 Keycloak 服务器通信
- **不经过 Gateway**（Gateway 只用于后端 API 的认证）
- 前端和 Keycloak 之间是 **OAuth2/OIDC 标准流程**

### 2. **Keycloak 如何检测登录状态**

`keycloak.init()` 方法会通过以下方式检查用户是否已登录：

#### 方式 1：检查浏览器存储的 Token

```javascript
keycloak.init({ onLoad: 'login-required' })
```

**检查流程**：
1. **检查 Session Storage**：
   - Keycloak 会在浏览器的 `sessionStorage` 中存储：
     - `kc-access-token` - 访问令牌
     - `kc-refresh-token` - 刷新令牌
     - `kc-id-token` - ID 令牌
     - `kc-state` - 状态信息

2. **检查 Token 有效性**：
   - 读取存储的 token
   - 解析 JWT token 的 `exp`（过期时间）字段
   - 如果 token 未过期 → 认为已登录
   - 如果 token 已过期 → 尝试用 refresh token 刷新

3. **检查 Keycloak Session Cookie**：
   - Keycloak 会在浏览器中设置一个 session cookie（例如：`KEYCLOAK_SESSION`）
   - 这个 cookie 是 Keycloak 服务器端会话的标识
   - 如果 cookie 存在且有效 → 说明在 Keycloak 端有活跃会话

#### 方式 2：OAuth2 授权码流程（首次登录）

如果 `sessionStorage` 中没有 token，`keycloak.init()` 会：

1. **重定向到 Keycloak 登录页**：
   ```
   http://127.0.0.1:8180/realms/my-realm/protocol/openid-connect/auth?
     client_id=game-hub&
     redirect_uri=http://localhost:5173&
     response_type=code&
     scope=openid profile email&
     state=xxx&
     code_challenge=xxx&
     code_challenge_method=S256
   ```

2. **用户在 Keycloak 登录**：
   - 用户输入用户名密码
   - Keycloak 验证身份
   - Keycloak 在服务器端创建 session

3. **Keycloak 重定向回前端**（带授权码）：
   ```
   http://localhost:5173/?code=xxx&state=xxx
   ```

4. **前端用授权码换取 Token**：
   ```javascript
   // keycloak-js 内部自动执行
   POST http://127.0.0.1:8180/realms/my-realm/protocol/openid-connect/token
   {
     grant_type: 'authorization_code',
     code: 'xxx',
     redirect_uri: 'http://localhost:5173',
     client_id: 'game-hub',
     code_verifier: 'xxx'  // PKCE
   }
   ```

5. **Keycloak 返回 Token**：
   ```json
   {
     "access_token": "eyJhbGciOiJSUzI1NiIs...",
     "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
     "id_token": "eyJhbGciOiJSUzI1NiIs...",
     "expires_in": 300,
     "refresh_expires_in": 1800
   }
   ```

6. **前端保存 Token**：
   - 将 token 保存到 `sessionStorage`
   - `keycloak.init()` 返回 `authenticated: true`

### 3. **Token 刷新机制**

当 token 即将过期时（默认提前 30 秒）：

```javascript
keycloak.onTokenExpired = () => {
  keycloak.updateToken(30)  // 提前 30 秒刷新
    .then((refreshed) => {
      if (refreshed) {
        // 刷新成功，新 token 已保存
      }
    })
    .catch(() => {
      // 刷新失败，重新登录
      keycloak.login()
    })
}
```

**刷新流程**：
1. 前端检测到 token 即将过期
2. 使用 `refresh_token` 调用 Keycloak 的 token endpoint
3. Keycloak 验证 refresh_token 有效性
4. 如果有效 → 返回新的 access_token 和 refresh_token
5. 如果无效 → 需要重新登录

### 4. **完整的登录状态检测流程**

```
用户访问前端
    ↓
keycloak.init({ onLoad: 'login-required' })
    ↓
检查 sessionStorage 中是否有 token？
    ├─ 有 token
    │   ├─ token 未过期？
    │   │   ├─ 是 → authenticated = true ✅
    │   │   └─ 否 → 尝试刷新
    │   │       ├─ 刷新成功 → authenticated = true ✅
    │   │       └─ 刷新失败 → 跳转登录页
    │   └─ 检查 Keycloak session cookie
    │       ├─ 存在 → authenticated = true ✅
    │       └─ 不存在 → 跳转登录页
    └─ 无 token
        └─ 跳转到 Keycloak 登录页
            ↓
        用户登录
            ↓
        Keycloak 重定向回前端（带 code）
            ↓
        前端用 code 换取 token
            ↓
        保存 token 到 sessionStorage
            ↓
        authenticated = true ✅
```

### 5. **为什么前端能直接连接 Keycloak？**

**OAuth2/OIDC 标准流程**：
- 前端应用是 **OAuth2 Client**（客户端）
- Keycloak 是 **Authorization Server**（授权服务器）
- 前端和 Keycloak 之间使用标准的 OAuth2 授权码流程（Authorization Code Flow）
- 这是 **公开的标准协议**，任何符合标准的客户端都可以直接连接

**安全性**：
- 使用 **PKCE**（Proof Key for Code Exchange）增强安全性
- Token 存储在浏览器的 `sessionStorage` 中（页面关闭后清除）
- Token 有过期时间，需要定期刷新
- 前端是 **Public Client**（不需要 client_secret）

### 6. **与 Gateway 的关系**

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   前端      │────────▶│  Keycloak   │         │   Gateway   │
│ (React)     │  OAuth2 │  (登录)     │         │  (API网关)  │
└─────────────┘         └─────────────┘         └─────────────┘
      │                                              │
      │                                              │
      │  API 请求 (带 token)                        │
      └─────────────────────────────────────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │ 后端服务    │
                    │ (验证 token)│
                    └─────────────┘
```

**分工**：
- **前端 ↔ Keycloak**：处理登录/登出，获取 token
- **前端 ↔ Gateway**：API 请求，Gateway 验证 token
- **Gateway ↔ 后端服务**：转发请求，传递 token

### 7. **实际代码中的检测逻辑**

在 `src/contexts/AuthContext.jsx` 中：

```javascript
keycloak.init(keycloakInitOptions)
  .then((authenticated) => {
    // authenticated 是 boolean
    // true = 已登录（有有效 token）
    // false = 未登录（keycloak.init 会自动跳转登录页）
    setIsAuthenticated(authenticated)
  })
```

**`authenticated` 为 `true` 的条件**：
1. `sessionStorage` 中有有效的 access_token
2. 或者成功用 refresh_token 刷新了 token
3. 或者成功完成了 OAuth2 授权码流程

**`authenticated` 为 `false` 的情况**：
1. `sessionStorage` 中没有 token
2. Token 已过期且 refresh_token 也失效
3. Keycloak session 已过期

### 8. **总结**

**前端如何知道登录状态**：
1. ✅ **直接连接 Keycloak**（不经过 Gateway）
2. ✅ **检查浏览器存储的 token**（sessionStorage）
3. ✅ **检查 token 有效性**（JWT 的 exp 字段）
4. ✅ **检查 Keycloak session cookie**
5. ✅ **自动刷新 token**（如果即将过期）
6. ✅ **OAuth2 标准流程**（授权码 + PKCE）

**关键点**：
- 前端是独立的 OAuth2 Client
- Keycloak 是 Authorization Server
- 两者直接通信，使用标准 OAuth2/OIDC 协议
- Gateway 只负责验证 token，不参与登录流程








