# Keycloak 前端集成说明

## ✅ 已完成的重构

前端已完全迁移到使用 `keycloak-js` SDK 进行认证，实现了完全的前后端分离。

## 📁 新增文件

1. **`src/config/keycloak.js`** - Keycloak 实例配置
   - 配置 Keycloak 服务器地址、realm、clientId
   - 导出 keycloak 实例和初始化选项

2. **`src/contexts/AuthContext.jsx`** - 认证上下文
   - `AuthProvider` 组件：在应用启动前初始化 Keycloak
   - `useAuth` hook：提供认证状态和用户信息
   - 自动处理 token 刷新和认证状态变化

3. **`src/services/api/apiClient.js`** - 全局 API 客户端
   - `authenticatedFetch`：自动注入 token 的 fetch 封装
   - `authenticatedJsonFetch`：自动处理 JSON 请求/响应
   - 自动处理 401 响应，触发重新登录

## 🔄 修改的文件

1. **`src/main.jsx`** - 应用入口
   - 添加 `AuthProvider` 包裹整个应用
   - 确保 Keycloak 初始化完成后再渲染 React

2. **`src/hooks/useAuth.js`** - 认证 Hook
   - 重新导出 `AuthContext` 中的 `useAuth`，保持向后兼容

3. **`src/services/api/gameApi.js`** - 游戏 API
   - 使用新的 `apiClient` 自动注入 token
   - 移除手动 token 管理

4. **`src/services/ws/gomokuSocket.js`** - WebSocket 连接
   - `connectWebSocket` 自动从 Keycloak 获取 token
   - 在 WebSocket URL 和 headers 中自动注入 token

5. **`src/components/layout/Header.jsx`** - 头部组件
   - 使用新的 `useAuth` hook
   - 登出使用 `keycloak.logout()`

6. **`src/pages/LobbyPage.jsx`** - 大厅页面
   - 移除手动 token 管理
   - API 调用自动使用 Keycloak token

7. **`src/hooks/useGomokuGame.js`** - 游戏逻辑 Hook
   - WebSocket 连接自动使用 Keycloak token

## 🗑️ 废弃的文件

- **`src/services/auth/authService.js`** - 已标记为废弃
  - 新的认证流程不再依赖此文件
  - 保留仅用于参考

## ⚙️ Keycloak 客户端配置要求

在 Keycloak 管理控制台中，需要配置以下内容：

### Valid redirect URIs（必须配置）

```
http://localhost:5173/*
http://localhost:5173
```

### Valid post logout redirect URIs（必须配置）

```
http://localhost:5173/*
http://localhost:5173
```

### Web Origins（CORS，必须配置）

```
http://localhost:5173
```

### 客户端配置

- **Client ID**: `game-hub`（与 Gateway 配置一致）
- **Client Protocol**: `openid-connect`
- **Access Type**: `public`（前端应用使用 public client）
- **Standard Flow Enabled**: `ON`
- **Direct Access Grants Enabled**: `OFF`（前端不需要）

## 🔄 认证流程

### 1. 应用启动

```
用户访问 http://localhost:5173/
  ↓
React 应用启动
  ↓
AuthProvider 初始化
  ↓
keycloak.init({ onLoad: 'login-required' })
  ↓
如果未登录 → 自动跳转到 Keycloak 登录页
  ↓
登录成功 → 返回前端
  ↓
React 应用正常渲染
```

### 2. API 请求

```
前端发起 API 请求
  ↓
apiClient.authenticatedFetch()
  ↓
自动检查 token 有效性
  ↓
如果 token 即将过期 → 自动刷新
  ↓
在请求头中注入 Authorization: Bearer <token>
  ↓
发送请求
  ↓
如果收到 401 → 自动调用 keycloak.login()
```

### 3. WebSocket 连接

```
前端建立 WebSocket 连接
  ↓
connectWebSocket()
  ↓
自动从 Keycloak 获取 token
  ↓
在 WebSocket URL 中附加 ?access_token=<token>
  ↓
在连接头中注入 Authorization: Bearer <token>
  ↓
建立连接
```

### 4. 登出

```
用户点击登出
  ↓
调用 keycloak.logout({ redirectUri: 'http://localhost:5173' })
  ↓
Keycloak 处理登出
  ↓
重定向回前端首页
```

## 🎯 关键特性

1. **自动登录检查**：应用启动时强制登录（`onLoad: 'login-required'`）
2. **自动 token 注入**：所有 API 请求自动携带 token
3. **自动 token 刷新**：token 即将过期时自动刷新
4. **自动重新登录**：token 刷新失败或收到 401 时自动跳转登录
5. **WebSocket 自动认证**：WebSocket 连接自动携带 token
6. **完全前后端分离**：前端完全控制登录流程，不依赖 Gateway 页面跳转

## ⚠️ 注意事项

1. **开发环境**：确保 Keycloak 运行在 `http://127.0.0.1:8180`
2. **生产环境**：需要更新 `src/config/keycloak.js` 中的配置
3. **CORS**：确保 Keycloak 客户端配置了正确的 Web Origins
4. **Redirect URIs**：确保 Keycloak 客户端配置了前端的所有可能路径

## 🧪 测试检查清单

- [ ] 访问首页，未登录时自动跳转到 Keycloak 登录页
- [ ] 登录成功后自动返回前端首页
- [ ] API 请求自动携带 token
- [ ] Token 过期时自动刷新
- [ ] 收到 401 时自动跳转登录
- [ ] WebSocket 连接自动携带 token
- [ ] 登出后跳回前端首页








