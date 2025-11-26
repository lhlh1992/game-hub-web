# 前后端分离架构迁移说明

> 本文档详细解释从"前后端不分离"到"前后端分离"的架构变化，帮助理解认证流程的根本性改变。

---

## 📋 目录

1. [架构对比总览](#架构对比总览)
2. [旧架构：前后端不分离](#旧架构前后端不分离)
3. [新架构：前后端分离](#新架构前后端分离)
4. [关键变化点](#关键变化点)
5. [Gateway 的角色变化](#gateway-的角色变化)
6. [常见疑问解答](#常见疑问解答)

---

## 架构对比总览

### 旧架构（前后端不分离）

```
┌─────────────┐
│   Browser   │
│  (HTML/JS)  │
└──────┬──────┘
       │ HTTP 请求
       ▼
┌─────────────────────────────────┐
│  Spring Cloud Gateway (8080)   │
│  ┌───────────────────────────┐ │
│  │  OAuth2 Client             │ │ ← Gateway 作为 OAuth2 Client
│  │  - 处理登录重定向          │ │
│  │  - 用 code 换 token        │ │
│  │  - 存储 token 到 session   │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │  资源服务器               │ │
│  │  - 验证 JWT token         │ │
│  │  - TokenRelay 转发        │ │
│  └───────────────────────────┘ │
└───────────┬─────────────────────┘
            │
            │ 转发请求（带 token）
            ▼
┌─────────────────────────────────┐
│  game-service (8081)            │
│  - 提供 HTML 页面              │
│  - 提供 REST API               │
│  - 提供 WebSocket              │
└─────────────────────────────────┘
```

### 新架构（前后端分离）

```
┌─────────────────────────────────┐
│   Browser (React App)           │
│   localhost:5173                │
│  ┌───────────────────────────┐ │
│  │  keycloak-js SDK          │ │ ← 前端直接与 Keycloak 交互
│  │  - 处理登录               │ │
│  │  - 管理 token             │ │
│  │  - 自动刷新 token         │ │
│  └───────────────────────────┘ │
└──────┬──────────────────────────┘
       │
       │ OAuth2/OIDC 流程
       │ (直接与 Keycloak 交互)
       ▼
┌─────────────────────────────────┐
│      Keycloak (8180)            │
│  - 认证服务器                  │
│  - 颁发 JWT token             │
└─────────────────────────────────┘
       │
       │ API 请求（带 token）
       ▼
┌─────────────────────────────────┐
│  Spring Cloud Gateway (8080)   │
│  ┌───────────────────────────┐ │
│  │  资源服务器               │ │ ← Gateway 只验证 token
│  │  - 验证 JWT token         │ │   （不再处理前端登录）
│  │  - TokenRelay 转发        │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │  OAuth2 Client            │ │ ← 仍然存在，但用于：
│  │  (可选，后端服务间认证)    │ │   - 后端服务间认证
│  └───────────────────────────┘ │   - 管理后台等场景
└───────────┬─────────────────────┘
            │
            │ 转发请求（带 token）
            ▼
┌─────────────────────────────────┐
│  game-service (8081)            │
│  - 只提供 REST API              │
│  - 只提供 WebSocket             │
│  - 不再提供 HTML 页面          │
└─────────────────────────────────┘
```

---

## 旧架构：前后端不分离

### 架构特点

- **前端位置**：`game-service` 服务中的 HTML/JS 文件
- **前端访问地址**：`http://localhost:8080/game-service/index.html`
- **Gateway 角色**：**OAuth2 Client** + 资源服务器
- **认证流程**：完全由 Gateway 处理

### 详细流程

#### 1. 用户访问前端页面

```
用户访问 http://localhost:8080/game-service/index.html
  ↓
Gateway 拦截请求
  ↓
检查是否有有效的认证（session 中的 token）
  ↓
如果未认证 → 重定向到 /oauth2/authorization/keycloak
```

#### 2. Gateway 处理登录

```
Gateway 重定向到 Keycloak 登录页
  ↓
用户在 Keycloak 登录
  ↓
Keycloak 重定向回 Gateway: /login/oauth2/code/keycloak?code=xxx
  ↓
Gateway（服务端）用 code 向 Keycloak 换取 token
  ↓
Gateway 将 token 存储到 session 中
  ↓
Gateway 重定向回原始请求的页面
```

#### 3. 前端获取 token

```javascript
// 前端通过 Gateway 的 /token 接口获取 token
fetch('http://localhost:8080/token')
  .then(res => res.json())
  .then(data => {
    const token = data.access_token
    // 存储到 localStorage
    localStorage.setItem('token', token)
  })
```

#### 4. API 请求

```javascript
// 前端在请求头中携带 token
fetch('http://localhost:8080/game-service/api/rooms', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
  ↓
Gateway 验证 token（资源服务器）
  ↓
Gateway 通过 TokenRelay 转发请求到 game-service（带 token）
  ↓
game-service 验证 token 并处理请求
```

### 关键代码位置

- **Gateway OAuth2 Client 配置**：`application.yml` 中的 `spring.security.oauth2.client`
- **Gateway 登录处理**：`SecurityConfig.java` 中的 `oauth2Login()`
- **Gateway Token 接口**：`TokenController.java` 中的 `/token` 端点
- **前端 HTML**：`game-service/src/main/resources/static/index.html`

---

## 新架构：前后端分离

### 架构特点

- **前端位置**：独立的 React 应用（Vite 开发服务器）
- **前端访问地址**：`http://localhost:5173`
- **Gateway 角色**：**纯资源服务器**（对前端来说）
- **认证流程**：前端直接与 Keycloak 交互

### 详细流程

#### 1. 用户访问前端页面

```
用户访问 http://localhost:5173
  ↓
React 应用启动
  ↓
AuthProvider 初始化
  ↓
keycloak.init({ onLoad: 'login-required' })
  ↓
如果未认证 → keycloak-js 自动重定向到 Keycloak 登录页
```

#### 2. 前端直接处理登录

```
用户在 Keycloak 登录
  ↓
Keycloak 重定向回前端: http://localhost:5173/?code=xxx&state=xxx
  ↓
keycloak-js SDK 自动处理回调
  ↓
keycloak-js 用 code 向 Keycloak 换取 token
  ↓
keycloak-js 将 token 存储到 sessionStorage
  ↓
React 应用正常渲染
```

#### 3. API 请求

```javascript
// 前端使用 apiClient，自动注入 token
import { apiGet } from '@/services/api/apiClient'

apiGet('http://localhost:8080/game-service/api/rooms')
  ↓
apiClient 自动从 keycloak.token 获取 token
  ↓
apiClient 在请求头中注入 Authorization: Bearer <token>
  ↓
发送请求到 Gateway
  ↓
Gateway 验证 token（资源服务器）
  ↓
Gateway 通过 TokenRelay 转发请求到 game-service（带 token）
  ↓
game-service 验证 token 并处理请求
```

### 关键代码位置

- **前端 Keycloak 配置**：`game-hub-web/src/config/keycloak.js`
- **前端认证上下文**：`game-hub-web/src/contexts/AuthContext.jsx`
- **前端 API 客户端**：`game-hub-web/src/services/api/apiClient.js`
- **Gateway 资源服务器配置**：`SecurityConfig.java` 中的 `oauth2ResourceServer()`

---

## 关键变化点

### 1. 认证流程的变化

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **登录入口** | Gateway: `/oauth2/authorization/keycloak` | 前端: `keycloak.login()` |
| **登录回调** | Gateway: `/login/oauth2/code/keycloak` | 前端: `http://localhost:5173/?code=xxx` |
| **Token 获取** | Gateway 服务端用 code 换 token | 前端 keycloak-js SDK 用 code 换 token |
| **Token 存储** | Gateway session | 前端 sessionStorage |
| **Token 管理** | Gateway 管理 | 前端 keycloak-js SDK 管理 |

### 2. Gateway 角色的变化

#### 旧架构中 Gateway 的角色

1. **OAuth2 Client**（主要角色）
   - 处理前端登录重定向
   - 用授权码换取 token
   - 管理 OAuth2 会话
   - 提供 `/token` 接口给前端

2. **资源服务器**（次要角色）
   - 验证 JWT token
   - 转发请求到下游服务

#### 新架构中 Gateway 的角色

1. **资源服务器**（主要角色）
   - 验证前端请求中的 JWT token
   - 转发请求到下游服务
   - **不再处理前端登录**

2. **OAuth2 Client**（可选，用于后端服务间认证）
   - 仍然存在，但**不再用于前端认证**
   - 可用于后端服务之间的认证
   - 可用于管理后台等场景

### 3. 前端的变化

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **技术栈** | HTML + 原生 JavaScript | React + Vite |
| **运行位置** | `game-service` 服务中 | 独立的开发服务器（5173） |
| **Keycloak 集成** | 通过 Gateway 的 `/token` 接口 | 直接使用 `keycloak-js` SDK |
| **Token 管理** | 手动调用 `/token` 接口 | SDK 自动管理 |
| **Token 刷新** | 手动处理 | SDK 自动刷新 |

### 4. 后端的变化

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **game-service** | 提供 HTML 页面 + API | 只提供 API（不再提供 HTML） |
| **Gateway** | OAuth2 Client + 资源服务器 | 主要是资源服务器 |
| **静态资源** | 由 `game-service` 提供 | 由前端 `public` 目录提供 |

---

## Gateway 的角色变化

### Gateway 的 OAuth2 Client 配置还在吗？

**答案：还在，但用途变了。**

#### 旧架构中

```yaml
# application.yml
spring:
  security:
    oauth2:
      client:
        registration:
          keycloak:
            client-id: game-hub
            client-secret: Lt2kkFyWYjJAEBNd7ZAk3TQTjMkj89iZ
            # ... 用于前端认证
```

- **用途**：处理前端用户的登录
- **流程**：用户 → Gateway → Keycloak → Gateway → 用户

#### 新架构中

```yaml
# application.yml（配置仍然存在）
spring:
  security:
    oauth2:
      client:
        registration:
          keycloak:
            client-id: game-hub
            client-secret: Lt2kkFyWYjJAEBNd7ZAk3TQTjMkj89iZ
            # ... 不再用于前端认证
```

- **用途**：**不再用于前端认证**
- **可能的用途**：
  - 后端服务之间的认证（如果将来需要）
  - 管理后台的认证（如果将来需要）
  - 保留配置以备将来使用

### Gateway 的资源服务器配置

```yaml
# application.yml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://127.0.0.1:8180/realms/my-realm
```

**这个配置在新旧架构中都是一样的！**

- **用途**：验证前端请求中的 JWT token
- **流程**：前端请求 → Gateway 验证 token → 转发到下游服务

---

## 常见疑问解答

### Q1: 旧架构完全被推翻了吗？

**A: 不是完全推翻，而是角色重新分配。**

- **Gateway 的 OAuth2 Client 功能**：不再用于前端认证，但配置保留（可能用于其他场景）
- **Gateway 的资源服务器功能**：**完全保留**，仍然验证 token 并转发请求
- **Keycloak 配置**：基本不变，只是重定向 URI 从 Gateway 改为前端
- **下游服务（game-service）**：基本不变，仍然接收带 token 的请求

### Q2: Gateway 现在还有什么用？

**A: Gateway 仍然非常重要！**

1. **API 网关**：统一入口，路由转发
2. **资源服务器**：验证所有 API 请求的 token
3. **TokenRelay**：将 token 转发到下游服务
4. **安全控制**：权限检查、黑名单管理
5. **负载均衡**：如果需要的话

**只是不再处理前端的登录流程了。**

### Q3: 前端直接和 Keycloak 交互，安全吗？

**A: 完全安全，这是标准做法。**

- **OAuth2/OIDC 标准**：前端应用直接与授权服务器交互是 OAuth2 标准流程
- **PKCE 增强**：使用 PKCE（Proof Key for Code Exchange）增强安全性
- **Public Client**：前端使用 public client，不需要 client secret
- **Token 存储**：token 存储在浏览器的 sessionStorage，相对安全

### Q4: 为什么前端不能继续用 Gateway 的 `/token` 接口？

**A: 技术上可以，但不推荐。**

**可以继续用的方式：**
- 前端仍然可以调用 Gateway 的 `/token` 接口获取 token
- 但需要 Gateway 保持 OAuth2 Client 的 session
- 这会导致前后端耦合，不利于独立部署

**不推荐的原因：**
- **前后端分离的目标**：前端和后端应该独立部署、独立扩展
- **Session 依赖**：Gateway 的 `/token` 接口依赖 session，不利于分布式部署
- **标准做法**：前端直接使用 keycloak-js SDK 是业界标准做法

### Q5: Gateway 的 OAuth2 Client 配置可以删除吗？

**A: 可以删除，但建议保留。**

**可以删除的情况：**
- 确定将来不会用于后端服务间认证
- 确定不会有管理后台需要 Gateway 处理登录

**建议保留的原因：**
- 配置保留不影响现有功能
- 将来可能需要用于其他场景
- 删除后如果需要再添加会比较麻烦

### Q6: 旧的前端代码（HTML）还能用吗？

**A: 技术上可以，但不推荐。**

- **可以**：如果 `game-service` 仍然提供 HTML 文件，旧代码仍然可以工作
- **不推荐**：新旧架构混用会导致维护困难
- **建议**：完全迁移到 React 前端，旧代码作为参考

### Q7: 前后端分离后，如何调试？

**A: 调试方式基本不变。**

- **前端调试**：使用浏览器 DevTools，查看 Network 面板
- **后端调试**：使用 IDE 断点调试
- **Keycloak 调试**：查看 Keycloak 日志和前端控制台日志

**新增的调试点：**
- 前端控制台会显示 keycloak-js SDK 的日志
- 可以检查 `keycloak.token` 是否存在
- 可以检查 API 请求是否携带正确的 token

---

## 总结

### 核心变化

1. **前端认证**：从 Gateway 处理 → 前端直接与 Keycloak 交互
2. **Gateway 角色**：从 OAuth2 Client + 资源服务器 → 主要是资源服务器
3. **Token 管理**：从 Gateway session → 前端 sessionStorage
4. **技术栈**：从 HTML/JS → React + keycloak-js SDK

### 保持不变的部分

1. **Gateway 的资源服务器功能**：完全保留
2. **下游服务**：基本不变
3. **Keycloak 配置**：基本不变（只是重定向 URI 改变）
4. **Token 验证流程**：基本不变

### 迁移建议

1. **逐步迁移**：可以先保留旧代码，逐步迁移到新架构
2. **测试验证**：每个功能迁移后都要测试验证
3. **文档更新**：及时更新相关文档
4. **团队沟通**：确保团队成员理解架构变化

---

## 参考文档

- [Keycloak 客户端配置检查清单](./KEYCLOAK_CLIENT_CHECKLIST.md)
- [Keycloak 工作原理说明](./KEYCLOAK_HOW_IT_WORKS.md)
- [Keycloak 设置指南](./KEYCLOAK_SETUP.md)
- [Gateway 认证指南](../game-hub-parent/apps/gateway/AUTH_GUIDE.md)

---

**最后更新**：2025-01-XX





