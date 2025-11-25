# Keycloak 客户端配置检查清单

## 问题现象
- 前端返回 `401 Unauthorized` 错误
- 右上角显示"登录"按钮而不是头像
- 无法切换到游戏界面

## 必须检查的 Keycloak 客户端配置

### 1. 访问 Keycloak 管理控制台
- 地址：http://localhost:8180
- 登录：admin / admin
- Realm：选择 `my-realm`

### 2. 检查 `game-hub` 客户端配置

#### 2.1 Settings 页面
- **Client ID**: `game-hub` ✅
- **Client Protocol**: `openid-connect` ✅
- **Access Type**: **必须是 `public`** ⚠️（不是 `confidential`）
- **Standard Flow Enabled**: **必须是 `ON`** ⚠️
- **Direct Access Grants Enabled**: `OFF`（前端不需要）

#### 2.2 Login settings 页面
- **Valid redirect URIs**: **必须包含以下内容** ⚠️
  ```
  http://localhost:5173/*
  http://localhost:5173
  ```
- **Valid post logout redirect URIs**: **必须包含以下内容** ⚠️
  ```
  http://localhost:5173/*
  http://localhost:5173
  ```
- **Web origins**: **必须包含以下内容** ⚠️
  ```
  http://localhost:5173
  ```

### 3. 如果客户端是 `confidential` 类型
如果 `game-hub` 客户端配置为 `confidential`（用于 Gateway），需要：

**方案 A：修改现有客户端为 public（不推荐，会影响 Gateway）**
- 将 `Access Type` 改为 `public`
- 删除 `Credentials` 标签页中的 `Client secret`

**方案 B：创建新的 public 客户端（推荐）**
1. 创建新客户端：
   - **Client ID**: `game-hub-web`（或 `game-hub-frontend`）
   - **Client Protocol**: `openid-connect`
   - **Access Type**: `public`
   - **Standard Flow Enabled**: `ON`
   - **Direct Access Grants Enabled**: `OFF`
2. 配置重定向 URI：
   - **Valid redirect URIs**: `http://localhost:5173/*`
   - **Valid post logout redirect URIs**: `http://localhost:5173/*`
   - **Web origins**: `http://localhost:5173`
3. 修改前端配置：
   - 在 `game-hub-web/src/config/keycloak.js` 中，将 `clientId` 改为新客户端 ID

### 4. 验证配置
1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 刷新页面（Ctrl+F5）
3. 查看控制台，应该能看到：
   - `Keycloak 配置:` 日志
   - `开始初始化 Keycloak` 日志
   - 如果配置正确，应该自动跳转到 Keycloak 登录页

## 常见错误
- ❌ `Access Type: confidential` → ✅ 应该是 `public`
- ❌ `Valid redirect URIs` 为空或不包含 `http://localhost:5173/*`
- ❌ `Standard Flow Enabled: OFF` → ✅ 应该是 `ON`
- ❌ `Web origins` 为空 → ✅ 应该包含 `http://localhost:5173`

