/**
 * 配置相关类型定义
 */

/**
 * 系统配置接口
 */
export interface SystemConfig {
  // 速率限制配置
  rateLimit: {
    maxPerSecond: number;
    maxPerHour: number;
    maxPerDay: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  // 数据库配置
  database: {
    path: string;
  };
  // 日志配置
  log: {
    retentionDays: number;
  };
  // WebSocket配置
  websocket: {
    port: number;
  };
  // API服务器配置
  api: {
    port: number;
  };
}

/**
 * 配置更新请求
 */
export type ConfigUpdateRequest = Partial<SystemConfig>;

/**
 * 配置重置请求
 */
export interface ConfigResetRequest {
  key?: keyof SystemConfig;
}
