# 前端架构文档

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [整体架构](#整体架构)
- [代码组织结构](#代码组织结构)
- [核心模块详解](#核心模块详解)
- [WebSocket 连接机制](#websocket-连接机制)
- [房间内逻辑](#房间内逻辑)
- [与后端交互](#与后端交互)
- [状态管理](#状态管理)
- [路由与页面](#路由与页面)
- [认证与授权](#认证与授权)
- [错误处理](#错误处理)
- [性能优化](#性能优化)

---

## 项目概述

Game Hub Web 是一个基于 React 的实时五子棋游戏前端应用，采用单页应用（SPA）架构，通过 WebSocket 实现实时游戏逻辑和聊天功能。应用支持玩家对战（PVP）和人机对战（PVE）两种模式，提供完整的房间管理、实时对局、聊天通信（含历史回溯）等功能。

### 核心特性

- **实时游戏对局**：基于 WebSocket 的实时棋盘状态同步
- **双 WebSocket 连接**：游戏逻辑与聊天功能独立连接，互不干扰
- **房间聊天历史**：进入房间自动加载最近 50 条历史（Redis 24h TTL，按房间隔离）
- **自动重连机制**：连接断开时自动重连，保证用户体验
- **心跳保活**：5 秒心跳间隔，及时检测连接状态
- **房间管理**：创建、加入、离开房间，支持房主权限
- **用户认证**：基于 Keycloak 的 OAuth2 认证流程

---

## 技术栈

### 核心框架

- **React 19.2.0**：UI 框架
- **React Router 7.9.6**：路由管理
- **Vite 7.2.4**：构建工具和开发服务器

### WebSocket 通信

- **SockJS 1.6.1**：WebSocket 传输层，提供降级方案
- **@stomp/stompjs 7.2.1**：STOMP 协议客户端，用于结构化消息传递

### 开发工具

- **ESLint**：代码规范检查
- **React Hooks**：函数式组件状态管理

---

## 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器客户端                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              React 应用层 (SPA)                      │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │    │
│  │  │  Pages   │  │Components│  │  Hooks   │          │    │
│  │  └──────────┘  └──────────┘  └──────────┘          │    │
│  │       │             │             │                   │    │
│  │       └─────────────┼─────────────┘                   │    │
│  │                     │                                 │    │
│  │  ┌──────────────────────────────────────┐           │    │
│  │  │         Contexts (状态管理)           │           │    │
│  │  │  - AuthContext                        │           │    │
│  │  │  - OngoingGameContext                 │           │    │
│  │  └──────────────────────────────────────┘           │    │
│  └─────────────────────────────────────────────────────┘    │
│                     │                                        │
│  ┌──────────────────┼──────────────────┐                     │
│  │                  │                  │                     │
│  ┌──────────────┐  │  ┌──────────────┐                    │
│  │  Services    │  │  │  WebSocket   │                    │
│  │  Layer       │  │  │  Layer       │                    │
│  ├──────────────┤  │  ├──────────────┤                    │
│  │ - apiClient  │  │  │ - gomokuSocket│                   │
│  │ - gameApi    │  │  │ - chatSocket │                   │
│  │ - userApi    │  │  │              │                   │
│  │ - authService│  │  │              │                   │
│  └──────────────┘  │  └──────────────┘                    │
│                     │                  │                     │
└─────────────────────┼──────────────────┼─────────────────────┘
                      │                  │
         ┌────────────┘                  └────────────┐
         │                                           │
    ┌────▼─────┐                              ┌─────▼────┐
    │  HTTP    │                              │ WebSocket│
    │  API     │                              │  (STOMP) │
    └────┬─────┘                              └─────┬────┘
         │                                         │
         └─────────────────┬───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Gateway   │
                    │  (Backend)  │
                    └─────────────┘
```

### 分层说明

1. **页面层（Pages）**：路由对应的页面组件，负责页面级状态和布局
2. **组件层（Components）**：可复用的 UI 组件
3. **Hooks 层**：业务逻辑封装，提供状态和副作用管理
4. **服务层（Services）**：API 调用和 WebSocket 连接管理
5. **上下文层（Contexts）**：全局状态管理

---

## 代码组织结构

```
src/
├── main.jsx                    # 应用入口
├── App.jsx                     # 根组件，路由配置
├── components/                 # 可复用组件
│   ├── chat/
│   │   └── GlobalChat.jsx     # 全局聊天组件
│   ├── common/
│   │   └── ProtectedRoute.jsx # 路由保护组件
│   └── layout/
│       ├── AppLayout.jsx      # 应用布局
│       └── Header.jsx         # 顶部导航栏
├── pages/                      # 页面组件
│   ├── HomePage.jsx           # 首页
│   ├── LobbyPage.jsx          # 大厅页面
│   ├── GameRoomPage.jsx       # 游戏房间页面（核心）
│   ├── ProfilePage.jsx        # 个人中心
│   ├── SessionMonitorPage.jsx # 会话监控
│   └── NotFoundPage.jsx       # 404 页面
├── hooks/                      # 自定义 Hooks
│   ├── useAuth.js             # 认证 Hook（重新导出）
│   ├── useGomokuGame.js       # 游戏逻辑 Hook
│   ├── useChatRoomWs.js       # 房间聊天 WebSocket Hook
│   ├── useGlobalChatWs.js     # 全局聊天 WebSocket Hook
│   └── useOngoingGame.js      # 进行中对局 Hook
├── contexts/                   # React Context
│   ├── AuthContext.jsx        # 认证上下文
│   └── OngoingGameContext.jsx # 进行中对局上下文
├── services/                   # 服务层
│   ├── api/                    # HTTP API 客户端
│   │   ├── apiClient.js       # 统一请求封装
│   │   ├── gameApi.js         # 游戏相关 API
│   │   ├── userApi.js         # 用户相关 API
│   │   └── sessionMonitor.js  # 会话监控 API
│   ├── auth/                   # 认证服务
│   │   └── authService.js     # Token 管理和认证流程
│   └── ws/                     # WebSocket 客户端
│       ├── gomokuSocket.js    # 游戏 WebSocket
│       └── chatSocket.js      # 聊天 WebSocket
├── config/                     # 配置文件
│   └── appConfig.js           # 应用配置
├── constants/                  # 常量定义
│   ├── gameConstants.js       # 游戏常量
│   └── gameEnums.js           # 游戏枚举
├── i18n/                       # 国际化
│   ├── index.js               # 导出
│   └── messages.js            # 消息定义
└── styles/                     # 样式文件
    ├── global.css             # 全局样式
    ├── game.css               # 游戏页面样式
    ├── lobby.css              # 大厅样式
    └── ...
```

---

## 核心模块详解

### 1. 认证模块（AuthContext & authService）

#### AuthContext

提供全局认证状态管理，包括：

- `isAuthenticated`：是否已认证
- `isLoading`：认证状态加载中
- `user`：当前用户信息
- `login()`：触发登录流程
- `logout()`：登出
- `refreshUser()`：刷新用户信息

#### authService

负责 Token 管理和认证流程：

- **Token 存储**：使用 `localStorage` 存储 `access_token`
- **Token 获取**：优先从 Gateway `/token` 接口获取（支持自动刷新），失败则使用本地存储
- **Token 验证**：通过 `/game-service/me` 接口验证 Token 有效性
- **认证流程**：
  1. 检查本地 Token → 验证有效性
  2. 无效则从 Gateway 获取新 Token
  3. 仍无效则跳转 Keycloak 登录页
- **401 处理**：检测到 401 响应时，显示登录失效弹窗，引导用户重新登录

### 2. WebSocket 模块

详见 [WebSocket 连接机制](#websocket-连接机制) 章节。

### 3. 游戏逻辑模块（useGomokuGame）

`useGomokuGame` 是游戏房间的核心 Hook，负责：

- **游戏状态管理**：棋盘、回合、胜负、倒计时等
- **WebSocket 订阅**：房间事件、座位分配、完整同步、被踢事件
- **游戏操作**：落子、认输、重新开始、准备、开始游戏
- **房间信息**：房间阶段、房主信息、座位信息、玩家连接状态

#### 状态同步机制

1. **首屏加载**：通过 HTTP `getRoomView()` 获取房间快照，确保即使 WebSocket 未连接也能显示房间状态
2. **WebSocket 连接后**：立即再次获取快照，确保获取最新状态
3. **实时更新**：通过 STOMP 订阅接收房间事件（`STATE`、`SNAPSHOT`、`TICK` 等）

#### 事件处理

- `STATE`：游戏状态更新（棋盘、回合、胜负）
- `SNAPSHOT`：房间完整快照（座位、准备状态、阶段等）
- `TICK`：倒计时更新
- `ERROR`：错误消息（如禁手提示）
- `READY_STATUS`、`ROOM_STATUS`：已废弃，统一使用 `SNAPSHOT`

---

## WebSocket 连接机制

### 架构设计

应用采用**双 WebSocket 连接**架构，游戏逻辑和聊天功能完全独立：

```
┌─────────────────────────────────────────────────┐
│            GameRoomPage (游戏房间页面)            │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  useGomokuGame Hook                     │   │
│  │  ┌────────────────────────────────────┐ │   │
│  │  │  gomokuSocket.js                  │ │   │
│  │  │  - 连接: /game-service/ws         │ │   │
│  │  │  - 用途: 游戏逻辑                  │ │   │
│  │  │  - 订阅:                           │ │   │
│  │  │    • /topic/room.{roomId}          │ │   │
│  │  │    • /user/queue/gomoku.seat      │ │   │
│  │  │    • /user/queue/gomoku.full      │ │   │
│  │  │    • /user/queue/gomoku.kicked    │ │   │
│  │  │  - 发送:                           │ │   │
│  │  │    • /app/gomoku.resume           │ │   │
│  │  │    • /app/gomoku.place            │ │   │
│  │  │    • /app/gomoku.ready            │ │   │
│  │  │    • ...                           │ │   │
│  │  └────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  useChatRoomWs Hook                     │   │
│  │  ┌────────────────────────────────────┐ │   │
│  │  │  chatSocket.js                     │ │   │
│  │  │  - 连接: /chat-service/ws          │ │   │
│  │  │  - 用途: 房间聊天                   │ │   │
│  │  │  - 订阅:                            │ │   │
│  │  │    • /topic/chat.room.{roomId}     │ │   │
│  │  │  - 发送:                            │ │   │
│  │  │    • /app/chat.room.send           │ │   │
│  │  └────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  AppLayout (全局布局)                    │   │
│  │  ┌────────────────────────────────────┐ │   │
│  │  │  useGlobalChatWs Hook              │ │   │
│  │  │  - 共享 chatSocket.js 连接          │ │   │
│  │  │  - 用途: 全局聊天连接管理            │ │   │
│  │  └────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 连接独立性

两条 WebSocket 连接**完全独立**：

1. **不同的服务端点**：
   - Game WS：`/game-service/ws`
   - Chat WS：`/chat-service/ws`

2. **独立的连接管理**：
   - 各自维护 `socket`、`stomp`、`subscriptions` 等状态
   - 各自的重连逻辑和计数器
   - 各自的心跳检测

3. **独立的生命周期**：
   - Game WS：进入房间时连接，离开房间时断开
   - Chat WS：登录后全局连接，登出时断开

4. **互不影响**：
   - 一条连接断开不影响另一条
   - 一条连接重连不影响另一条
   - 各自的状态提示独立显示

### 连接建立流程

#### Game WebSocket（gomokuSocket.js）

```javascript
connectWebSocket(callbacks)
  ↓
connectWebSocketInternal(callbacks, isInitialConnect)
  ↓
1. 检查是否已连接 → 是则直接回调 onConnect
2. 获取 Token（ensureAuthenticated）
3. 创建 SockJS 连接：/game-service/ws?access_token={token}
4. 创建 STOMP 客户端（Stomp.over(socket)）
5. 配置心跳：outgoing=5000ms, incoming=5000ms
6. 连接 STOMP（带 Authorization header）
7. 连接成功后：
   - 启动心跳检测定时器（每 5 秒检查 stomp.connected）
   - 回调 onConnect
8. 订阅房间事件（由 useGomokuGame 调用）
```

#### Chat WebSocket（chatSocket.js）

```javascript
connectChatWebSocket(callbacks)
  ↓
1. 添加回调到 callbackListeners Set（支持多个监听器）
2. 检查是否已连接 → 是则直接回调新监听器的 onConnect
3. 检查是否正在重连 → 是则只添加监听器，不干扰重连
4. connectChatWebSocketInternal(isInitialConnect)
  ↓
（后续流程与 Game WS 类似，但连接地址为 /chat-service/ws）
```

### 心跳机制

#### 配置

- **心跳间隔**：5 秒（客户端和服务端双向）
- **检测频率**：每 5 秒检查一次 `stomp.connected` 状态

#### 实现细节

**后端配置**（Spring WebSocket）：
```java
registry.enableSimpleBroker("/topic", "/queue")
    .setHeartbeatValue(new long[]{5000, 5000})  // [客户端发送间隔, 服务端发送间隔]
    .setTaskScheduler(wsHeartbeatTaskScheduler)
```

**前端配置**（STOMP 客户端）：
```javascript
stomp.heartbeat.outgoing = 5000  // 客户端每 5 秒发送心跳
stomp.heartbeat.incoming = 5000  // 期望服务端每 5 秒发送心跳
```

**主动检测**：
```javascript
// 连接成功后启动定期检查
heartbeatCheckInterval = setInterval(() => {
  if (stomp && !stomp.connected) {
    // 检测到断开，触发重连
    callbacks.onDisconnect?.()
    scheduleReconnect(false)
  }
}, 5000)
```

### 自动重连机制

#### 重连策略

采用**指数退避**策略：

- **初始延迟**：1 秒
- **最大延迟**：30 秒
- **最大重连次数**：10 次
- **延迟计算**：`min(1000 * 2^attempt, 30000)`

重连延迟序列：1s → 2s → 4s → 8s → 16s → 30s（上限）→ 30s → ...

#### 重连触发条件

1. **连接关闭**：`socket.onclose` 事件
2. **连接错误**：`socket.onerror` 事件（SockJS 检测到错误）
3. **STOMP 错误**：`stomp.onStompError` 回调
4. **连接超时**：10 秒内未连接成功
5. **心跳检测失败**：定期检查发现 `stomp.connected === false`

#### 重连保护机制

1. **手动断开不重连**：`isManualDisconnect` 标志，登出或离开房间时设置为 `true`
2. **401 不重连**：检测到未授权错误时，直接触发登出流程
3. **初始连接不显示提示**：`isInitialConnect` 参数，避免首次连接时显示重连提示

#### 重连流程

```javascript
scheduleReconnect(isInitialConnect)
  ↓
1. 检查 isManualDisconnect → 是则退出
2. 检查重连次数 → 达到上限则回调 onReconnectFailed
3. 计算延迟（指数退避）
4. 如果不是初始连接，回调 onReconnecting（显示提示）
5. 设置定时器，延迟后调用 connectWebSocketInternal
  ↓
connectWebSocketInternal
  ↓
（重新建立连接流程）
```

### 多监听器支持（Chat WebSocket）

Chat WebSocket 支持多个组件同时监听同一连接：

#### 问题背景

在游戏房间页面中，`useGlobalChatWs`（全局布局）和 `useChatRoomWs`（房间页面）都需要监听 Chat WebSocket 连接状态。如果使用单个回调变量，后调用的会覆盖先调用的，导致只有最后一个组件能收到重连事件。

#### 解决方案

使用 `Set` 存储多个回调对象：

```javascript
// chatSocket.js
const callbackListeners = new Set()

function notifyListeners(method, ...args) {
  callbackListeners.forEach((callbacks) => {
    if (callbacks && typeof callbacks[method] === 'function') {
      try {
        callbacks[method](...args)
      } catch (error) {
        // 监听器回调出错，不影响其他监听器
      }
  })
}

export async function connectChatWebSocket(callbacks = {}) {
  // 添加回调到 Set
  if (callbacks && Object.keys(callbacks).length > 0) {
    callbackListeners.add(callbacks)
  }
  
  // 如果已连接，直接通知新监听器
  if (stomp && stomp.connected) {
    callbacks.onConnect?.()
    return
  }
  
  // 如果正在重连，只添加监听器，不干扰重连
  if (reconnectTimer) {
    return
  }
  
  // 初始化连接
  await connectChatWebSocketInternal(true)
}

export function removeChatWebSocketCallbacks(callbacks) {
  callbackListeners.delete(callbacks)
}
```

#### 使用方式

```javascript
// useGlobalChatWs.js
useEffect(() => {
  const callbacks = { onConnect, onDisconnect, ... }
  connectChatWebSocket(callbacks)
  return () => {
    removeChatWebSocketCallbacks(callbacks)  // 只移除自己的回调
  }
}, [isAuthenticated])

// useChatRoomWs.js
useEffect(() => {
  const callbacks = { onConnect, onDisconnect, ... }
  connectChatWebSocket(callbacks)
  return () => {
    removeChatWebSocketCallbacks(callbacks)  // 只移除自己的回调
  }
}, [roomId, onMessage])
```

### STOMP 订阅管理

#### 订阅结构

使用 `Map` 存储订阅，key 为 topic，value 为订阅对象：

```javascript
const subscriptions = new Map()

function subscribeRoom(roomId, onEvent) {
  const topic = `/topic/room.${roomId}`
  
  // 如果已订阅，先取消旧订阅
  if (subscriptions.has(topic)) {
    subscriptions.get(topic).unsubscribe()
  }
  
  // 创建新订阅
  const sub = client.subscribe(topic, (frame) => {
    const evt = JSON.parse(frame.body)
    onEvent(evt)
  })
  
  subscriptions.set(topic, sub)
}
```

#### 订阅清理

- **手动断开**：`disconnectWebSocket()` 时清理所有订阅
- **组件卸载**：Hook 的 `useEffect` cleanup 函数中取消特定订阅

---

## 房间内逻辑

### 页面结构

`GameRoomPage` 是游戏房间的核心页面，包含：

1. **游戏棋盘**：15x15 五子棋棋盘
2. **玩家面板**：显示自己和对手的信息、准备状态、连接状态
3. **聊天面板**：房间内聊天消息
4. **状态栏**：显示当前回合、倒计时、游戏状态
5. **操作按钮**：准备、开始游戏、认输、重新开始等

### 双 WebSocket 连接在房间内的协作

#### Game WebSocket（useGomokuGame）

**职责**：
- 游戏逻辑：落子、准备、开始游戏、认输、重新开始
- 房间状态：座位分配、房间阶段、玩家连接状态
- 游戏状态：棋盘、回合、胜负、倒计时

**订阅**：
- `/topic/room.{roomId}`：房间事件（STATE、SNAPSHOT、TICK、ERROR 等）
- `/user/queue/gomoku.seat`：座位分配（seatKey、side）
- `/user/queue/gomoku.full`：完整同步（重连时）
- `/user/queue/gomoku.kicked`：被踢事件

**发送**：
- `/app/gomoku.resume`：恢复连接
- `/app/gomoku.place`：落子
- `/app/gomoku.ready`：准备/取消准备
- `/app/gomoku.start`：开始游戏
- `/app/gomoku.resign`：认输
- `/app/gomoku.restart`：重新开始
- `/app/gomoku.kick`：踢出玩家

#### Chat WebSocket（useChatRoomWs）

**职责**：
- 房间内聊天消息收发
- 进入房间前先拉取最近 50 条聊天历史（HTTP `/chat-service/api/rooms/{roomId}/history`），再订阅实时消息

**订阅**：
- `/topic/chat.room.{roomId}`：房间聊天消息

**发送**：
- `/app/chat.room.send`：发送聊天消息

### 状态同步流程

#### 1. 进入房间

```
用户进入 /game/:roomId
  ↓
GameRoomPage 组件挂载
  ↓
useGomokuGame Hook 初始化
  ↓
1. HTTP 请求：getRoomView(roomId) → 获取房间快照（首屏渲染）
2. WebSocket 连接：connectWebSocket() → 建立 Game WS 连接
3. WebSocket 连接成功后：
   - 订阅房间事件
   - 订阅座位分配
   - 订阅完整同步
   - 订阅被踢事件
   - 发送 resume 请求
   - 再次 HTTP 请求：getRoomView(roomId) → 确保获取最新状态
  ↓
useChatRoomWs Hook 初始化
  ↓
先拉取房间聊天历史：GET /chat-service/api/rooms/{roomId}/history?limit=50
  ↓
connectChatWebSocket() → 建立 Chat WS 连接（或复用已有连接）
  ↓
订阅房间聊天：subscribeRoomChat(roomId, onMessage)
```

#### 2. 游戏进行中

```
玩家落子
  ↓
placeStone(x, y) → sendPlace(roomId, x, y, side, seatKey)
  ↓
Game WS 发送：/app/gomoku.place
  ↓
后端处理，广播 STATE 事件
  ↓
前端接收：/topic/room.{roomId} → handleRoomEvent(evt)
  ↓
更新棋盘状态：setBoard(newBoard)
更新回合：setSideToMove(newSide)
更新倒计时：setCountdown(tick)
```

#### 3. 连接断开与重连

```
网络断开 / 后端重启
  ↓
Game WS：socket.onclose 触发
  ↓
scheduleReconnect(false) → 显示重连提示
  ↓
指数退避延迟后：connectWebSocketInternal()
  ↓
重新建立连接
  ↓
连接成功后：
  - 重新订阅所有 topic
  - 发送 resume 请求（携带 seatKey）
  - 后端返回完整同步（/user/queue/gomoku.full）
  ↓
handleFullSync(snap) → 恢复所有游戏状态
```

**Chat WS 重连流程类似，但独立进行，不影响 Game WS。**
**被踢处理**：游戏 WS 收到被踢事件只弹出“被踢出房间”提示并跳转大厅，不触发登录失效；同时刷新进行中对局状态以清空残留。

### 用户信息缓存机制

#### 问题背景

聊天消息中可能只包含 `senderId`，没有 `senderName`。如果每次都请求后端获取用户信息，会导致频繁的 API 调用。

#### 解决方案

使用本地缓存 `userInfoCache`，优先级策略：

1. **消息中的 senderName**（最高优先级）
2. **本地缓存**（`userInfoCache[userId]`）
3. **座位信息**（`seatXUserInfo`、`seatOUserInfo`）
4. **senderId**（兜底）

#### 缓存更新时机

1. **进入房间时**：从房间快照中提取座位用户信息，写入缓存
2. **收到消息时**：如果消息包含用户信息，更新缓存
3. **懒加载**：如果消息只有 `senderId` 没有 `senderName`，且缓存中没有，则请求后端获取
4. **用户信息更新**：当用户在个人中心修改信息后，`useAuth` 的 `user` 对象更新，同步更新本地缓存

#### 实现细节

```javascript
// GameRoomPage.jsx
const [userInfoCache, setUserInfoCache] = useState({})

const resolveDisplayName = useCallback((senderId, senderName) => {
  if (senderName) return senderName
  
  const key = String(senderId)
  const cachedProfile = userInfoCache[key]
  if (cachedProfile) {
    return cachedProfile.nickname || cachedProfile.username || key
  }
  
  // 兜底：查座位信息
  const candidates = [seatXUserInfo, seatOUserInfo]
  for (const info of candidates) {
    if (info?.userId === key || info?.systemUserId === key) {
      return info.nickname || info.username || key
    }
  }
  
  return key || 'Unknown'
}, [userInfoCache, seatXUserInfo, seatOUserInfo])

// 懒加载用户信息
const ensureUserProfile = useCallback(async (userId) => {
  if (pendingUserFetch.current.has(userId)) return
  
  pendingUserFetch.current.add(userId)
  try {
    const info = await getUserInfo(userId)
    if (info) {
      upsertUserInfos([info])  // 更新缓存
      // 更新已收到的消息显示名
      setChatHistory((prev) => prev.map(msg => 
        msg.senderId === userId 
          ? { ...msg, senderName: resolveDisplayName(userId, null) }
          : msg
      ))
    }
  } finally {
    pendingUserFetch.current.delete(userId)
  }
}, [])
```

---

## 与后端交互

### HTTP API

#### API 客户端封装（apiClient.js）

统一封装所有 HTTP 请求：

- **认证处理**：自动添加 `Authorization: Bearer {token}` header
- **401 处理**：检测到 401 时触发登出流程
- **错误处理**：统一解析错误响应，提取 `message` 字段

#### 主要 API 接口

**游戏相关**（gameApi.js）：
- `createRoom(options)`：创建房间
- `joinRoom(roomId)`：加入房间
- `leaveRoom(roomId)`：离开房间
- `getRoomView(roomId)`：获取房间快照
- `getOngoingGame()`：获取进行中的对局
- `endOngoingGame(roomId)`：结束对局
- `listGomokuRooms(params)`：获取房间列表
- `getUserInfos(userIds)`：批量获取用户信息
- `getUserInfo(userId)`：获取单个用户信息

**用户相关**（userApi.js）：
- `getUserProfile()`：获取用户资料
- `updateUserProfile(data)`：更新用户资料

**认证相关**（authService.js）：
- `getTokenFromGateway()`：从 Gateway 获取 Token
- `ensureAuthenticated(autoLogin)`：确保已认证
- `getUserInfo()`：获取用户信息（优先 system-service，失败则 gateway）

### WebSocket API

#### Game WebSocket（game-service）

**订阅（接收）**：
- `/topic/room.{roomId}`：房间事件
- `/user/queue/gomoku.seat`：座位分配
- `/user/queue/gomoku.full`：完整同步
- `/user/queue/gomoku.kicked`：被踢事件

**发送**：
- `/app/gomoku.resume`：恢复连接
- `/app/gomoku.place`：落子
- `/app/gomoku.ready`：准备/取消准备
- `/app/gomoku.start`：开始游戏
- `/app/gomoku.resign`：认输
- `/app/gomoku.restart`：重新开始
- `/app/gomoku.kick`：踢出玩家

#### Chat WebSocket（chat-service）

**订阅（接收）**：
- `/topic/chat.room.{roomId}`：房间聊天消息

**发送**：
- `/app/chat.room.send`：发送聊天消息

### 认证流程

#### Token 传递

**HTTP 请求**：
```
Authorization: Bearer {token}
```

**WebSocket 连接**：
1. **URL 参数**：`/game-service/ws?access_token={token}`（SockJS 握手请求）
2. **STOMP Header**：`Authorization: Bearer {token}`（STOMP 连接请求）

#### Token 刷新

Gateway 的 `/token` 接口支持自动刷新 Token（基于 Cookie），前端优先使用该接口获取最新 Token。

---

## 状态管理

### Context API

#### AuthContext

全局认证状态：

```javascript
{
  isAuthenticated: boolean,
  isLoading: boolean,
  user: UserInfo | null,
  login: () => void,
  logout: () => void,
  refreshUser: () => Promise<void>
}
```

#### OngoingGameContext

进行中对局状态：

```javascript
{
  loading: boolean,
  data: { hasOngoing: boolean, roomId?: string, ... } | null,
  error: Error | null,
  refresh: () => Promise<void>,
  end: (roomId?: string) => Promise<void>
}
```

### 组件级状态

使用 `useState` 管理组件内部状态，如：

- `GameRoomPage`：聊天历史、用户信息缓存、UI 状态（弹窗、提示等）
- `useGomokuGame`：游戏状态（棋盘、回合、胜负等）
- `useChatRoomWs`：连接状态（connected、reconnecting、error）

### 状态同步策略

1. **首屏加载**：HTTP 请求获取初始状态
2. **WebSocket 连接后**：立即获取最新状态（HTTP）
3. **实时更新**：WebSocket 事件驱动状态更新
4. **重连恢复**：通过完整同步（FullSync）恢复状态

---

## 路由与页面

### 路由配置（App.jsx）

```javascript
<Routes>
  <Route element={<AppLayout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
    <Route path="/game/:roomId" element={<ProtectedRoute><GameRoomPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/sessions" element={<SessionMonitorPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Routes>
```

### 页面说明

1. **HomePage**：首页，未登录用户入口
2. **LobbyPage**：大厅，显示房间列表，创建/加入房间
3. **GameRoomPage**：游戏房间，核心页面
4. **ProfilePage**：个人中心，用户信息管理
5. **SessionMonitorPage**：会话监控（公开页面，无需登录）
6. **NotFoundPage**：404 页面

### 路由保护

`ProtectedRoute` 组件检查 `isAuthenticated`，未登录则重定向到首页。

---

## 认证与授权

### 认证流程

1. **应用启动**：`AuthProvider` 初始化，检查 Token
2. **Token 验证**：通过 `/game-service/me` 验证 Token 有效性
3. **Token 获取**：无效则从 Gateway `/token` 获取新 Token
4. **登录跳转**：仍无效则跳转 Keycloak 登录页
5. **登录回调**：Keycloak 回调后，Gateway 设置 Cookie，前端获取 Token

### Token 管理

- **存储**：`localStorage`（key: `access_token`）
- **获取优先级**：
  1. Gateway `/token` 接口（支持自动刷新）
  2. 本地存储的 Token
- **验证**：每次使用前通过 `/game-service/me` 验证
- **刷新**：Gateway 自动刷新（基于 Cookie），前端无需手动处理

### 401 处理

检测到 401 响应时：

1. **显示登录失效弹窗**：引导用户重新登录
2. **清理本地 Token**：`clearToken()`
3. **设置登出标志**：`sessionLoggingOut = true`
4. **WebSocket 断开**：检测到 401 时，设置 `isManualDisconnect = true`，不触发自动重连

---

## 错误处理

### HTTP 错误处理

**统一处理**（apiClient.js）：
- 401：触发登出流程
- 其他错误：解析响应，提取 `message` 字段，抛出 Error

**组件级处理**：
- 使用 `try-catch` 捕获错误
- 显示用户友好的错误提示
- 静默处理非关键错误（如用户信息加载失败）

### WebSocket 错误处理

**连接错误**：
- `socket.onerror`：SockJS 错误，触发重连
- `stomp.onStompError`：STOMP 错误，401 则登出，其他则重连
- 连接超时：10 秒未连接成功，触发重连

**消息错误**：
- JSON 解析失败：静默忽略
- 订阅回调错误：捕获异常，不影响其他订阅

### 用户提示

- **Toast 消息**：临时提示（3 秒自动消失）
- **弹窗**：重要操作确认（如被踢出房间）
- **状态指示器**：连接状态（绿色圆点=已连接，红色圆点=断开，旋转图标=重连中）

---

## 性能优化

### 1. 代码分割

- 使用 React Router 的懒加载（未来可优化）
- 组件按需加载

### 2. 状态优化

- **useCallback**：稳定回调函数引用，避免不必要的重渲染
- **useMemo**：缓存计算结果
- **ref**：存储不需要触发重渲染的值（如 `seatKeyRef`、`boardRef`）

### 3. 请求优化

- **用户信息缓存**：避免重复请求同一用户信息
- **批量获取**：`getUserInfos()` 批量获取用户信息
- **懒加载**：聊天消息中缺失用户信息时才请求

### 4. WebSocket 优化

- **订阅管理**：避免重复订阅同一 topic
- **连接复用**：Chat WS 全局连接，多个组件共享
- **重连优化**：指数退避，避免频繁重连

### 5. 渲染优化

- **条件渲染**：使用 `&&` 和三元运算符
- **列表 key**：使用稳定的 key（如 `crypto.randomUUID()`）
- **避免不必要的状态更新**：使用 `useRef` 存储不需要触发渲染的值

---

## 总结

Game Hub Web 前端采用现代化的 React 架构，通过双 WebSocket 连接实现游戏逻辑和聊天功能的解耦，采用自动重连和心跳机制保证连接稳定性，使用本地缓存和懒加载优化性能。整体架构清晰，模块化程度高，易于维护和扩展。

