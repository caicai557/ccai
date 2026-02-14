import { LogDao, LogEntry, LogLevel, LogFilters } from '../../database/dao/LogDao';
import { logger as winstonLogger } from '../../utils/logger';
import { wsManager } from '../../routes/ws';

/**
 * 日志服务配置
 */
export interface LogServiceConfig {
  retentionDays: number; // 日志保留天数
  enableDatabaseLogging: boolean; // 是否启用数据库日志
}

/**
 * 日志导出格式
 */
export type LogExportFormat = 'json' | 'csv';

/**
 * 日志服务
 * 负责日志的记录、查询、过滤和导出
 */
export class LogService {
  private config: LogServiceConfig;

  constructor(
    private logDao: LogDao,
    config?: Partial<LogServiceConfig>
  ) {
    this.config = {
      retentionDays: config?.retentionDays || 30,
      enableDatabaseLogging: config?.enableDatabaseLogging !== false,
    };
  }

  /**
   * 记录INFO级别日志
   */
  info(message: string, accountId?: string, taskId?: string, details?: any): void {
    this.log('INFO', message, accountId, taskId, details);
  }

  /**
   * 记录WARN级别日志
   */
  warn(message: string, accountId?: string, taskId?: string, details?: any): void {
    this.log('WARN', message, accountId, taskId, details);
  }

  /**
   * 记录ERROR级别日志
   */
  error(message: string, accountId?: string, taskId?: string, details?: any): void {
    this.log('ERROR', message, accountId, taskId, details);
  }

  /**
   * 记录DEBUG级别日志
   */
  debug(message: string, accountId?: string, taskId?: string, details?: any): void {
    this.log('DEBUG', message, accountId, taskId, details);
  }

  /**
   * 记录日志
   */
  private log(
    level: LogLevel,
    message: string,
    accountId?: string,
    taskId?: string,
    details?: any
  ): void {
    // 记录到winston日志
    const logMessage = this.formatLogMessage(message, accountId, taskId);
    winstonLogger.log(level.toLowerCase(), logMessage, details);

    // 记录到数据库
    if (this.config.enableDatabaseLogging) {
      try {
        const logEntry = this.logDao.create({
          level,
          message,
          accountId,
          taskId,
          details: details ? JSON.stringify(details) : undefined,
        });

        // 推送新日志到WebSocket客户端
        wsManager.broadcastNewLog({
          id: logEntry.id,
          level: logEntry.level,
          message: logEntry.message,
          accountId: logEntry.accountId,
          taskId: logEntry.taskId,
          createdAt: logEntry.createdAt,
        });
      } catch (error) {
        winstonLogger.error('写入数据库日志失败:', error);
      }
    }
  }

  /**
   * 格式化日志消息
   */
  private formatLogMessage(message: string, accountId?: string, taskId?: string): string {
    const parts = [message];

    if (accountId) {
      parts.push(`[账号: ${accountId}]`);
    }

    if (taskId) {
      parts.push(`[任务: ${taskId}]`);
    }

    return parts.join(' ');
  }

  /**
   * 查询日志
   */
  query(filters?: LogFilters, limit: number = 100, offset: number = 0): LogEntry[] {
    return this.logDao.findByFilters(filters || {}, limit, offset);
  }

  /**
   * 获取日志总数
   */
  count(filters?: LogFilters): number {
    return this.logDao.count(filters);
  }

  /**
   * 获取最近的日志
   */
  getRecent(limit: number = 100): LogEntry[] {
    return this.logDao.findRecent(limit);
  }

  /**
   * 根据ID获取日志
   */
  getById(id: string): LogEntry | undefined {
    return this.logDao.findById(id);
  }

  /**
   * 导出日志
   */
  export(filters?: LogFilters, format: LogExportFormat = 'json'): string {
    const logs = this.logDao.findByFilters(filters || {}, 10000, 0);

    if (format === 'json') {
      return this.exportAsJson(logs);
    } else {
      return this.exportAsCsv(logs);
    }
  }

  /**
   * 导出为JSON格式
   */
  private exportAsJson(logs: LogEntry[]): string {
    return JSON.stringify(logs, null, 2);
  }

  /**
   * 导出为CSV格式
   */
  private exportAsCsv(logs: LogEntry[]): string {
    if (logs.length === 0) {
      return '';
    }

    // CSV头部
    const headers = ['ID', '级别', '消息', '账号ID', '任务ID', '详情', '创建时间'];
    const rows = [headers.join(',')];

    // CSV数据行
    for (const log of logs) {
      const row = [
        log.id,
        log.level,
        this.escapeCsvValue(log.message),
        log.accountId || '',
        log.taskId || '',
        log.details ? this.escapeCsvValue(log.details) : '',
        log.createdAt,
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * 转义CSV值
   */
  private escapeCsvValue(value: string): string {
    // 如果包含逗号、引号或换行符，需要用引号包裹并转义引号
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 清理过期日志
   */
  cleanup(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const deletedCount = this.logDao.deleteOlderThan(cutoffDate);
    winstonLogger.info(
      `清理了 ${deletedCount} 条过期日志（保留天数: ${this.config.retentionDays}）`
    );

    return deletedCount;
  }

  /**
   * 删除指定日志
   */
  delete(id: string): boolean {
    return this.logDao.delete(id);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LogServiceConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): LogServiceConfig {
    return { ...this.config };
  }
}
