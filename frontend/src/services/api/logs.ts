import { get, download } from './client';
import type { LogMessage } from '../../types/common';

/**
 * 日志查询参数
 */
export interface LogQueryParams {
  level?: 'info' | 'warn' | 'error';
  accountId?: string;
  taskId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * 日志 API 服务
 */
export const logsApi = {
  /**
   * 获取日志列表
   */
  getAll: (params?: LogQueryParams): Promise<{ logs: LogMessage[]; total: number }> => {
    return get<{
      logs: Array<{
        id: string;
        level: string;
        message: string;
        accountId?: string;
        details?: any;
        createdAt: string;
      }>;
      total: number;
    }>('/api/logs', params).then((res) => ({
      logs: res.logs.map((log) => ({
        level: String(log.level || '').toLowerCase() as 'info' | 'warn' | 'error',
        timestamp: log.createdAt,
        accountId: log.accountId,
        message: log.message,
        details: log.details,
      })),
      total: res.total,
    }));
  },

  /**
   * 导出日志
   */
  export: (params?: LogQueryParams, format: 'json' | 'csv' = 'json'): Promise<void> => {
    const filename = `logs-${new Date().toISOString().split('T')[0]}.${format}`;
    // 构建查询参数
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }
    queryParams.append('format', format);

    const url = `/api/logs/export?${queryParams.toString()}`;
    return download(url, filename);
  },

  /**
   * 获取最近的日志
   */
  getRecent: (limit: number = 100): Promise<LogMessage[]> => {
    return getAllNormalized({ limit });
  },

  /**
   * 按级别获取日志
   */
  getByLevel: (level: 'info' | 'warn' | 'error', limit: number = 100): Promise<LogMessage[]> => {
    return getAllNormalized({ level, limit });
  },

  /**
   * 按账号获取日志
   */
  getByAccount: (accountId: string, limit: number = 100): Promise<LogMessage[]> => {
    return getAllNormalized({ accountId, limit });
  },

  /**
   * 按任务获取日志
   */
  getByTask: (taskId: string, limit: number = 100): Promise<LogMessage[]> => {
    return getAllNormalized({ taskId, limit });
  },
};

const getAllNormalized = async (params?: LogQueryParams): Promise<LogMessage[]> => {
  const res = await logsApi.getAll(params);
  return res.logs;
};
