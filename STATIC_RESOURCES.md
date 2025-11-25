# 静态资源路径说明

## ✅ 图片路径已全部迁移

所有图片路径已从 `/game-service/images/...` 改为 `/images/...`

### 图片文件位置
- 前端项目：`game-hub-web/public/images/`
- 访问路径：`/images/...`（Vite 自动处理）

### 路径更新情况

**已更新的文件**：
- ✅ `src/pages/HomePage.jsx` - 首页图片
- ✅ `src/components/layout/Header.jsx` - 头像和图标
- ✅ `src/pages/GameRoomPage.jsx` - 游戏房间头像
- ✅ `src/styles/header.css` - CSS 背景图片
- ✅ `src/styles/home.css` - CSS 背景图片

## 🔄 路径分类说明

### 1. 前端静态资源（不经过 Gateway）

```
/images/...              → Vite 直接提供，不经过 Gateway
/public/...              → Vite 直接提供，不经过 Gateway
```

**特点**：
- 直接从 Vite dev server 提供
- 不经过 Gateway
- 不需要认证
- 生产环境打包后由前端服务器（如 Nginx）提供

### 2. API 调用（经过 Gateway）

```
/game-service/api/...    → 通过 Vite proxy → Gateway → 后端服务
/system-service/api/...  → 通过 Vite proxy → Gateway → 后端服务
/game-service/ws        → 通过 Vite proxy → Gateway → WebSocket
```

**特点**：
- 通过 Vite 的 `proxy` 配置转发到 Gateway
- Gateway 验证 token
- 需要认证（除了明确放行的接口）

### 3. 认证相关（经过 Gateway）

```
/oauth2/...             → 通过 Vite proxy → Gateway → Keycloak
/token                  → 通过 Vite proxy → Gateway
/logout                 → 通过 Vite proxy → Gateway
```

**注意**：现在前端使用 `keycloak-js` 直接连接 Keycloak，这些路径可能不再使用。

## 🎯 关键点

1. **图片不会经过 Gateway**：
   - `/images/...` 是前端静态资源
   - Vite 直接提供，不经过 Gateway
   - Gateway 的图片路径放行配置可以删除（虽然保留也没问题）

2. **API 调用需要经过 Gateway**：
   - `/game-service/api/...` 等 API 路径需要经过 Gateway
   - 这是正常的，因为需要 Gateway 验证 token

3. **前后端完全分离**：
   - 前端静态资源：前端自己提供
   - API 调用：通过 Gateway 转发
   - 认证：前端直接连接 Keycloak

## 📝 Gateway 配置建议

既然图片已经迁移到前端，Gateway 的图片路径放行配置可以删除：

```java
// 可以删除这行，因为图片不再从后端获取
.pathMatchers("/game-service/images/**").permitAll()
```

但保留也没问题，不会影响功能。



