/**
 * 游戏相关的常量值
 * 统一管理所有固定数值和配置
 */

/**
 * 棋盘配置
 */
export const BOARD_CONFIG = {
  SIZE: 15,
  CELL_SIZE: 42,
  CELL_VISUAL: 42 * 0.8,
  BOARD_PADDING: 44,
  GRID_LINE_HALF: 0.75,
  LETTERS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'],
  STAR_POINTS: [
    { x: 7, y: 7, isTengen: true },
    { x: 3, y: 3 },
    { x: 3, y: 11 },
    { x: 11, y: 3 },
    { x: 11, y: 11 },
  ],
}

/**
 * 游戏时间配置
 */
export const GAME_TIME = {
  TURN_SECONDS: 30,
  COUNTDOWN_WARNING: 10, // 倒计时警告阈值（秒）
}

/**
 * 默认值
 */
export const DEFAULTS = {
  AVATAR: '/images/avatar-default.png',
  PLAYER_NAME: '玩家',
  OPPONENT_NAME: 'Waiting...',
  AI_OPPONENT_NAME: 'AI Opponent',
}

/**
 * 计算棋盘尺寸
 */
export function getBoardDimension() {
  const { SIZE, CELL_SIZE, BOARD_PADDING } = BOARD_CONFIG
  return CELL_SIZE * (SIZE - 1) + CELL_SIZE * 0.4 + BOARD_PADDING * 2
}

/**
 * 计算棋盘网格原点
 */
export function getBoardGridOrigin() {
  return BOARD_CONFIG.BOARD_PADDING - BOARD_CONFIG.GRID_LINE_HALF
}

