export * from './theme';

/**
 * API 基础地址配置
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * WebSocket 地址配置
 */
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

/**
 * 应用配置
 */
export const APP_CONFIG = {
  name: 'Telegram频道管理系统',
  version: '1.0.0',
  defaultPageSize: 20,
  maxPageSize: 100,
};
