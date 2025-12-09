/**
 * 国际化消息文件
 * 统一管理所有用户可见的文本提示
 * 
 * 未来可以扩展为多语言支持：
 * - messages.zh-CN.js
 * - messages.en-US.js
 * - 使用 i18next 或 react-intl 等库
 */

/**
 * 游戏房间相关消息
 */
export const ROOM_MESSAGES = {
  // 踢人相关
  KICKED_OUT_TITLE: '你已被踢出房间',
  KICKED_OUT_REASON: '可返回大厅加入其他房间或创建新房间',
  KICKED_PLAYER_SUCCESS: (playerName) => `已将 ${playerName} 移出房间`,
  
  // 房间状态
  ROOM_WAITING: '等待中',
  ROOM_PLAYING: '游戏中',
  ROOM_FINISHED: '已结束',
  
  // 玩家状态
  PLAYER_WAITING: 'Waiting...',
  PLAYER_READY: '已准备',
  PLAYER_NOT_READY: '未准备',
}

/**
 * 游戏相关消息
 */
export const GAME_MESSAGES = {
  VICTORY: 'Victory!',
  GAME_STARTED: '游戏开始',
  GAME_OVER: '游戏结束',
  YOUR_TURN: '你的回合',
  OPPONENT_TURN: '对手回合',
  BLACK_TO_PLAY: 'Black to play',
  WHITE_TO_PLAY: 'White to play',
}

/**
 * 错误消息
 */
export const ERROR_MESSAGES = {
  KICK_FAILED: '踢人失败',
  KICK_FAILED_DETAIL: (error) => `踢人失败：${error?.message || '未知错误'}`,
  FORBIDDEN_MOVE: '禁手',
  ILLEGAL_MOVE: '非法落子',
  NETWORK_ERROR: '网络错误',
  UNAUTHORIZED: '未授权',
  ROOM_NOT_FOUND: '房间不存在',
}

/**
 * 系统消息
 */
export const SYSTEM_MESSAGES = {
  GAME_STARTED: 'Game started',
  PLAYER_JOINED: (playerName) => `${playerName} joined`,
  PLAYER_LEFT: (playerName) => `${playerName} left`,
  TURN_STARTED: (playerName) => `${playerName}'s turn`,
}

/**
 * 操作提示
 */
export const ACTION_MESSAGES = {
  CONFIRM: '确定',
  CANCEL: '取消',
  LEAVE_ROOM: '离开房间',
  KICK_PLAYER: '踢出玩家',
  START_GAME: '开始游戏',
  READY: '准备',
  NOT_READY: '取消准备',
}

/**
 * 通用消息模板函数
 * 用于动态生成消息
 */
export const MessageTemplates = {
  /**
   * 格式化玩家名称
   */
  playerName: (name) => name || ROOM_MESSAGES.PLAYER_WAITING,
  
  /**
   * 格式化回合信息
   */
  turnInfo: (side) => {
    return side === 'X' ? GAME_MESSAGES.BLACK_TO_PLAY : GAME_MESSAGES.WHITE_TO_PLAY
  },
}

