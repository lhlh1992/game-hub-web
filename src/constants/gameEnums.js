/**
 * 游戏相关的枚举值
 * 统一管理所有字典值，避免硬编码
 */

/**
 * 棋子类型
 */
export const PieceType = {
  EMPTY: '.',
  BLACK: 'X',
  WHITE: 'O',
}

/**
 * 棋子颜色（用于显示）
 */
export const PieceColor = {
  BLACK: 'black',
  WHITE: 'white',
}

/**
 * 棋子文本（用于显示）
 */
export const PieceText = {
  BLACK: 'Black',
  WHITE: 'White',
}

/**
 * 游戏模式
 */
export const GameMode = {
  PVP: 'PVP',
  PVE: 'PVE',
}

/**
 * 游戏规则
 */
export const GameRule = {
  STANDARD: 'STANDARD',
  RENJU: 'RENJU',
}

/**
 * 房间阶段
 */
export const RoomPhase = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
}

/**
 * 消息类型（用于 Toast）
 */
export const MessageType = {
  ERROR: 'error',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
}

/**
 * 辅助函数：根据棋子类型获取颜色
 */
export function getPieceColor(piece) {
  if (piece === PieceType.BLACK) return PieceColor.BLACK
  if (piece === PieceType.WHITE) return PieceColor.WHITE
  return null
}

/**
 * 辅助函数：根据棋子类型获取文本
 */
export function getPieceText(piece) {
  if (piece === PieceType.BLACK) return PieceText.BLACK
  if (piece === PieceType.WHITE) return PieceText.WHITE
  return null
}

