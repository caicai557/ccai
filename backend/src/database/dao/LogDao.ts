import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';

/**
 * 日志级别
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

/**
 * 日志记录接口
 */
export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  accountId?: string;
  taskId?: string;
  details?: string; // JSON字符串
  createdAt: string;
}

/**
 * 日志过滤条件
 */
export interface LogFilters {
  level?: LogLevel;
  accountId?: string;
  taskId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 日志数据访问对象
 */
export class LogDao extends BaseDao<LogEntry> {
  constructor(db: Database.Database) {
    super(db);
  }

  /**
   * 查找所有日志
   */
  findAll(): LogEntry[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        level,
        message,
        account_id as accountId,
        task_id as taskId,
        details,
        created_at as createdAt
      FROM logs
      ORDER BY created_at DESC
    `);

    return stmt.all() as LogEntry[];
  }

  /**
   * 根据ID查找日志
   */
  findById(id: string): LogEntry | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        level,
        message,
        account_id as accountId,
        task_id as taskId,
        details,
        created_at as createdAt
      FROM logs
      WHERE id = ?
    `);

    return stmt.get(id) as LogEntry | undefined;
  }

  /**
   * 创建日志记录
   */
  create(data: Partial<LogEntry>): LogEntry {
    const id = this.generateId();
    const createdAt = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO logs (
        id, level, message, account_id, task_id, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.level || 'INFO',
      data.message || '',
      data.accountId || null,
      data.taskId || null,
      data.details || null,
      createdAt
    );

    return {
      id,
      level: data.level || 'INFO',
      message: data.message || '',
      accountId: data.accountId,
      taskId: data.taskId,
      details: data.details,
      createdAt,
    };
  }

  /**
   * 更新日志（通常不需要更新日志）
   */
  update(id: string, _data: Partial<LogEntry>): LogEntry | undefined {
    // 日志通常是不可变的，但保留接口以符合BaseDao
    return this.findById(id);
  }

  /**
   * 删除日志
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM logs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 根据过滤条件查询日志
   */
  findByFilters(filters: LogFilters, limit: number = 100, offset: number = 0): LogEntry[] {
    let query = `
      SELECT 
        id,
        level,
        message,
        account_id as accountId,
        task_id as taskId,
        details,
        created_at as createdAt
      FROM logs
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.level) {
      query += ' AND level = ?';
      params.push(filters.level);
    }

    if (filters.accountId) {
      query += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters.taskId) {
      query += ' AND task_id = ?';
      params.push(filters.taskId);
    }

    if (filters.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate.toISOString());
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as LogEntry[];
  }

  /**
   * 统计日志数量
   */
  count(filters?: LogFilters): number {
    let query = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
    const params: any[] = [];

    if (filters) {
      if (filters.level) {
        query += ' AND level = ?';
        params.push(filters.level);
      }

      if (filters.accountId) {
        query += ' AND account_id = ?';
        params.push(filters.accountId);
      }

      if (filters.taskId) {
        query += ' AND task_id = ?';
        params.push(filters.taskId);
      }

      if (filters.startDate) {
        query += ' AND created_at >= ?';
        params.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query += ' AND created_at <= ?';
        params.push(filters.endDate.toISOString());
      }
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * 删除指定日期之前的日志
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM logs WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * 获取最近的日志
   */
  findRecent(limit: number = 100): LogEntry[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        level,
        message,
        account_id as accountId,
        task_id as taskId,
        details,
        created_at as createdAt
      FROM logs
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as LogEntry[];
  }
}
