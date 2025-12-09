# 常量管理指南

## 📁 文件结构

```
src/
├── constants/          # 常量定义
│   ├── gameEnums.js    # 枚举值（X, O, BLACK, WHITE 等）
│   └── gameConstants.js # 固定数值（棋盘大小、时间等）
├── i18n/               # 国际化消息
│   ├── messages.js     # 所有用户可见的文本
│   └── index.js        # 统一导出
└── config/             # 配置
    └── appConfig.js     # 应用配置
```

## 🎯 使用原则

### 1. **枚举值（Enums）**
所有字典值（X, O, 0, 1, 2, 3 等）统一放在 `constants/gameEnums.js`

```javascript
// ❌ 错误：硬编码
if (piece === 'X') { ... }
if (side === 'BLACK') { ... }

// ✅ 正确：使用枚举
import { PieceType, PieceColor } from '@/constants/gameEnums'
if (piece === PieceType.BLACK) { ... }
if (side === PieceColor.BLACK) { ... }
```

### 2. **提示词（Messages）**
所有用户可见的文本统一放在 `i18n/messages.js`

```javascript
// ❌ 错误：硬编码
showMessage('你已被踢出房间')
showMessage(`已将 ${name} 移出房间`)

// ✅ 正确：使用消息常量
import { ROOM_MESSAGES } from '@/i18n'
showMessage(ROOM_MESSAGES.KICKED_OUT_TITLE)
showMessage(ROOM_MESSAGES.KICKED_PLAYER_SUCCESS(name))
```

### 3. **固定数值（Constants）**
所有固定数值统一放在 `constants/gameConstants.js`

```javascript
// ❌ 错误：硬编码
const BOARD_SIZE = 15
const TURN_SECONDS = 30

// ✅ 正确：使用常量
import { BOARD_CONFIG, GAME_TIME } from '@/constants/gameConstants'
const size = BOARD_CONFIG.SIZE
const seconds = GAME_TIME.TURN_SECONDS
```

## 📝 使用示例

### 示例 1：使用枚举值

```javascript
import { PieceType, PieceColor, getPieceColor } from '@/constants/gameEnums'

// 判断棋子类型
if (cell === PieceType.BLACK) {
  // 处理黑子
}

// 获取颜色
const color = getPieceColor(piece) // 'black' 或 'white'
```

### 示例 2：使用消息常量

```javascript
import { ROOM_MESSAGES, ERROR_MESSAGES } from '@/i18n'

// 显示踢人提示
showMessage(ROOM_MESSAGES.KICKED_OUT_TITLE, 'error')
showMessage(ROOM_MESSAGES.KICKED_PLAYER_SUCCESS('张三'), 'info')

// 显示错误
showMessage(ERROR_MESSAGES.KICK_FAILED_DETAIL(error), 'error')
```

### 示例 3：使用游戏常量

```javascript
import { BOARD_CONFIG, GAME_TIME, DEFAULTS } from '@/constants/gameConstants'

// 使用棋盘配置
const boardSize = BOARD_CONFIG.SIZE
const letters = BOARD_CONFIG.LETTERS

// 使用时间配置
const turnTime = GAME_TIME.TURN_SECONDS

// 使用默认值
const avatar = user.avatar || DEFAULTS.AVATAR
```

## 🔄 迁移步骤

1. **识别硬编码值**
   - 搜索代码中的字符串字面量
   - 搜索数字常量
   - 搜索字典值（X, O, BLACK, WHITE 等）

2. **分类整理**
   - 枚举值 → `constants/gameEnums.js`
   - 提示词 → `i18n/messages.js`
   - 固定值 → `constants/gameConstants.js`

3. **逐步替换**
   - 先替换高频使用的
   - 再替换低频使用的
   - 保持向后兼容

## 🌍 未来扩展：多语言支持

当需要支持多语言时，可以这样扩展：

```javascript
// i18n/messages.zh-CN.js
export const ROOM_MESSAGES = {
  KICKED_OUT_TITLE: '你已被踢出房间',
  // ...
}

// i18n/messages.en-US.js
export const ROOM_MESSAGES = {
  KICKED_OUT_TITLE: 'You have been kicked out',
  // ...
}

// i18n/index.js
import { getUserLocale } from '@/utils/locale'
import zhCN from './messages.zh-CN.js'
import enUS from './messages.en-US.js'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export function getMessages() {
  const locale = getUserLocale()
  return messages[locale] || messages['zh-CN']
}
```

## ✅ 检查清单

重构代码时，检查以下内容：

- [ ] 所有字典值（X, O, BLACK, WHITE）是否使用枚举？
- [ ] 所有用户可见文本是否使用消息常量？
- [ ] 所有固定数值是否使用常量？
- [ ] 是否还有硬编码的字符串？
- [ ] 是否还有硬编码的数字？

