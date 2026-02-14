import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';

/**
 * 任务执行记录
 */
export interface TaskExecution {
  id: string;
  taskId: string;
  executedAt: Date;
  success: boolean;
  messageContent?: string;
  errorMessage?: string;
  targetMessageId?: string;
  accountId?: string;
  targetId?: string;
  retryCount: number;
}

/**
 * 任务执行历史数据访问对象
 */
export class TaskExecutionDao extends BaseDao<TaskExecution> {
  constructor(db: Database.Database) {
    super(db);
  }

  /**
   * 查找所有执行记录
   */
  findAll(): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions
      ORDER BY executed_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  /**
   * 根据ID查找执行记录
   */
  findById(id: string): TaskExecution | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRowToExecution(row) : undefined;
  }

  /**
   * 根据任务ID查找执行记录
   */
  findByTaskId(taskId: string, limit?: number): TaskExecution[] {
    const sql = `
      SELECT * FROM task_executions
      WHERE task_id = ?
      ORDER BY executed_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(taskId) as any[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  /**
   * 根据账号ID查找执行记录
   */
  findByAccountId(accountId: string, limit?: number): TaskExecution[] {
    const sql = `
      SELECT * FROM task_executions
      WHERE account_id = ?
      ORDER BY executed_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(accountId) as any[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  /**
   * 创建执行记录
   */
  create(data: Partial<TaskExecution>): TaskExecution {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO task_executions (
        id, task_id, executed_at, success, message_content,
        error_message, target_message_id, account_id, target_id, retry_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.taskId,
      data.executedAt ? data.executedAt.toISOString() : now,
      data.success ? 1 : 0,
      data.messageContent || null,
      data.errorMessage || null,
      data.targetMessageId || null,
      data.accountId || null,
      data.targetId || null,
      data.retryCount || 0
    );

    const created = this.findById(id);
    if (!created) {
      throw new Error('创建任务执行记录失败');
    }

    return created;
  }

  /**
   * 更新执行记录
   */
  update(id: string, data: Partial<TaskExecution>): TaskExecution | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.success !== undefined) {
      updates.push('success = ?');
      values.push(data.success ? 1 : 0);
    }

    if (data.messageContent !== undefined) {
      updates.push('message_content = ?');
      values.push(data.messageContent);
    }

    if (data.errorMessage !== undefined) {
      updates.push('error_message = ?');
      values.push(data.errorMessage);
    }

    if (data.retryCount !== undefined) {
      updates.push('retry_count = ?');
      values.push(data.retryCount);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE task_executions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * 删除执行记录
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM task_executions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 删除指定任务的所有执行记录
   */
  deleteByTaskId(taskId: string): number {
    const stmt = this.db.prepare('DELETE FROM task_executions WHERE task_id = ?');
    const result = stmt.run(taskId);
    return result.changes;
  }

  /**
   * 删除指定天数之前的执行记录
   */
  deleteOlderThanDays(days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stmt = this.db.prepare(`
      DELETE FROM task_executions
      WHERE executed_at < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    return result.changes;
  }

  /**
   * 获取任务的执行统计
   */
  getTaskStats(
    taskId: string,
    days?: number
  ): {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastExecutedAt?: Date;
  } {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count,
        MAX(executed_at) as last_executed_at
      FROM task_executions
      WHERE task_id = ?
    `;

    const params: any[] = [taskId];

    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      sql += ' AND executed_at >= ?';
      params.push(cutoffDate.toISOString());
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as any;

    const total = row.total || 0;
    const successCount = row.success_count || 0;
    const failureCount = row.failure_count || 0;
    const successRate = total > 0 ? successCount / total : 0;

    return {
      totalExecutions: total,
      successCount,
      failureCount,
      successRate,
      lastExecutedAt: row.last_executed_at ? new Date(row.last_executed_at) : undefined,
    };
  }

  /**
   * 获取账号的执行统计
   */
  getAccountStats(
    accountId: string,
    days?: number
  ): {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  } {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
      FROM task_executions
      WHERE account_id = ?
    `;

    const params: any[] = [accountId];

    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      sql += ' AND executed_at >= ?';
      params.push(cutoffDate.toISOString());
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as any;

    const total = row.total || 0;
    const successCount = row.success_count || 0;
    const failureCount = row.failure_count || 0;
    const successRate = total > 0 ? successCount / total : 0;

    return {
      totalExecutions: total,
      successCount,
      failureCount,
      successRate,
    };
  }

  /**
   * 获取最近的执行记录
   */
  findRecent(limit: number = 100): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions
      ORDER BY executed_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  /**
   * 获取失败的执行记录
   */
  findFailures(limit?: number): TaskExecution[] {
    const sql = `
      SELECT * FROM task_executions
      WHERE success = 0
      ORDER BY executed_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToExecution(row));
  }

  /**
   * 将数据库行映射为TaskExecution对象
   */
  private mapRowToExecution(row: any): TaskExecution {
    return {
      id: row.id,
      taskId: row.task_id,
      executedAt: new Date(row.executed_at),
      success: row.success === 1,
      messageContent: row.message_content || undefined,
      errorMessage: row.error_message || undefined,
      targetMessageId: row.target_message_id || undefined,
      accountId: row.account_id || undefined,
      targetId: row.target_id || undefined,
      retryCount: row.retry_count || 0,
    };
  }
}
