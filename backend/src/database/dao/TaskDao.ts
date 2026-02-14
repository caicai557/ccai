import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { Task } from '../../types/task';

/**
 * 任务数据访问对象
 */
export class TaskDao extends BaseDao<Task> {
  constructor(db: Database.Database) {
    super(db);
  }

  /**
   * 查找所有任务
   */
  findAll(): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      ORDER BY priority DESC, created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 根据ID查找任务
   */
  findById(id: string): Task | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRowToTask(row) : undefined;
  }

  /**
   * 根据状态查找任务
   */
  findByStatus(status: 'running' | 'stopped'): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE status = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(status) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 根据账号ID查找任务
   */
  findByAccountId(accountId: string): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE account_ids LIKE ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(`%${accountId}%`) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 根据类型查找任务
   */
  findByType(type: 'group_posting' | 'channel_monitoring'): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE type = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(type) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 创建任务
   */
  create(data: Partial<Task>): Task {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, type, account_ids, target_ids, config, status, priority,
        next_run_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.type,
      JSON.stringify(data.accountIds || []),
      JSON.stringify(data.targetIds || []),
      JSON.stringify(data.config || {}),
      data.status || 'stopped',
      data.priority !== undefined ? data.priority : 5, // 默认优先级为5
      data.nextRunAt ? data.nextRunAt.toISOString() : null,
      now,
      now
    );

    const created = this.findById(id);
    if (!created) {
      throw new Error('创建任务失败');
    }

    return created;
  }

  /**
   * 更新任务
   */
  update(id: string, data: Partial<Task>): Task | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const now = this.now();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }

    if (data.accountIds !== undefined) {
      updates.push('account_ids = ?');
      values.push(JSON.stringify(data.accountIds));
    }

    if (data.targetIds !== undefined) {
      updates.push('target_ids = ?');
      values.push(JSON.stringify(data.targetIds));
    }

    if (data.config !== undefined) {
      updates.push('config = ?');
      values.push(JSON.stringify(data.config));
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (data.priority !== undefined) {
      updates.push('priority = ?');
      values.push(data.priority);
    }

    if (data.nextRunAt !== undefined) {
      updates.push('next_run_at = ?');
      values.push(data.nextRunAt ? data.nextRunAt.toISOString() : null);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * 删除任务
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 更新任务状态
   */
  updateStatus(id: string, status: 'running' | 'stopped'): boolean {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(status, this.now(), id);
    return result.changes > 0;
  }

  /**
   * 更新下次运行时间
   */
  updateNextRunAt(id: string, nextRunAt: Date | null): boolean {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET next_run_at = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(nextRunAt ? nextRunAt.toISOString() : null, this.now(), id);
    return result.changes > 0;
  }

  /**
   * 获取需要执行的任务（状态为running且next_run_at已到期）
   * 按优先级从高到低排序
   */
  findDueTasks(): Task[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'running'
        AND (next_run_at IS NULL OR next_run_at <= ?)
      ORDER BY priority DESC, next_run_at ASC
    `);

    const rows = stmt.all(now) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 将数据库行映射为Task对象
   */
  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      type: row.type,
      accountIds: JSON.parse(row.account_ids),
      targetIds: JSON.parse(row.target_ids),
      config: JSON.parse(row.config),
      status: row.status,
      priority: row.priority !== undefined ? row.priority : 5, // 默认优先级为5
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
