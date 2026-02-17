import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { DiscoverySourceType, TaskDraft, TaskDraftStatus } from '../../types';

interface TaskDraftQuery {
  status?: TaskDraftStatus;
  runId?: string;
  sourceType?: DiscoverySourceType;
  page?: number;
  pageSize?: number;
}

export class TaskDraftDao extends BaseDao<TaskDraft> {
  private readonly baseSelect = `
    SELECT
      id,
      candidate_id AS candidateId,
      target_id AS targetId,
      task_type AS taskType,
      account_ids AS accountIds,
      template_id AS templateId,
      config,
      priority,
      status,
      confirmed_task_id AS confirmedTaskId,
      reason,
      run_id AS runId,
      source_type AS sourceType,
      index_bot_username AS indexBotUsername,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM task_drafts
  `;

  constructor(db: Database.Database) {
    super(db);
  }

  findAll(): TaskDraft[] {
    const stmt = this.db.prepare(`${this.baseSelect} ORDER BY created_at DESC`);
    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToTaskDraft(row));
  }

  findById(id: string): TaskDraft | undefined {
    const stmt = this.db.prepare(`${this.baseSelect} WHERE id = ?`);
    const row = stmt.get(id) as any;
    return row ? this.mapRowToTaskDraft(row) : undefined;
  }

  findActiveByCandidateId(candidateId: string): TaskDraft | undefined {
    const stmt = this.db.prepare(
      `${this.baseSelect} WHERE candidate_id = ? AND status IN ('pending', 'confirmed') ORDER BY created_at DESC LIMIT 1`
    );
    const row = stmt.get(candidateId) as any;
    return row ? this.mapRowToTaskDraft(row) : undefined;
  }

  list(query: TaskDraftQuery): { items: TaskDraft[]; total: number } {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: Array<string | number> = [];

    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.runId) {
      where.push('run_id = ?');
      params.push(query.runId);
    }
    if (query.sourceType) {
      where.push('source_type = ?');
      params.push(query.sourceType);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM task_drafts ${whereClause}`);
    const total = (totalStmt.get(...params) as { count: number }).count;

    const stmt = this.db.prepare(
      `${this.baseSelect} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    const rows = stmt.all(...params, pageSize, offset) as any[];

    return {
      items: rows.map((row) => this.mapRowToTaskDraft(row)),
      total,
    };
  }

  getDailyStats(days: number): Array<{
    day: string;
    created: number;
    confirmed: number;
    rejected: number;
    confirmRate: number;
  }> {
    const safeDays = Math.max(1, Math.min(30, Number(days || 7)));
    const rows = this.db
      .prepare(
        `
          SELECT
            DATE(created_at) AS day,
            COUNT(*) AS created,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
          FROM task_drafts
          WHERE datetime(created_at) >= datetime('now', ?)
          GROUP BY DATE(created_at)
          ORDER BY day DESC
        `
      )
      .all(`-${safeDays} day`) as Array<{
      day: string;
      created: number;
      confirmed: number | null;
      rejected: number | null;
    }>;

    return rows.map((row) => {
      const created = Number(row.created || 0);
      const confirmed = Number(row.confirmed || 0);
      const rejected = Number(row.rejected || 0);
      const confirmRate = created > 0 ? Number((confirmed / created).toFixed(4)) : 0;
      return {
        day: row.day,
        created,
        confirmed,
        rejected,
        confirmRate,
      };
    });
  }

  getSourceFailureStats(days: number): Array<{
    sourceType: DiscoverySourceType;
    indexBotUsername?: string;
    rejected: number;
  }> {
    const safeDays = Math.max(1, Math.min(30, Number(days || 7)));
    const rows = this.db
      .prepare(
        `
          SELECT
            source_type AS sourceType,
            index_bot_username AS indexBotUsername,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
          FROM task_drafts
          WHERE datetime(created_at) >= datetime('now', ?)
          GROUP BY source_type, index_bot_username
          ORDER BY rejected DESC
        `
      )
      .all(`-${safeDays} day`) as Array<{
      sourceType: DiscoverySourceType;
      indexBotUsername: string | null;
      rejected: number | null;
    }>;

    return rows.map((row) => ({
      sourceType: row.sourceType,
      indexBotUsername: row.indexBotUsername || undefined,
      rejected: Number(row.rejected || 0),
    }));
  }

  create(data: Partial<TaskDraft>): TaskDraft {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO task_drafts (
        id, candidate_id, target_id, task_type, account_ids, template_id, config,
        priority, status, confirmed_task_id, reason, run_id, source_type, index_bot_username,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.candidateId,
      data.targetId,
      data.taskType,
      JSON.stringify(data.accountIds || []),
      data.templateId || null,
      JSON.stringify(data.config || {}),
      data.priority ?? 5,
      data.status || 'pending',
      data.confirmedTaskId || null,
      data.reason || null,
      data.runId || null,
      data.sourceType,
      data.indexBotUsername || null,
      now,
      now
    );

    const created = this.findById(id);
    if (!created) {
      throw new Error('创建任务草稿失败');
    }

    return created;
  }

  update(id: string, data: Partial<TaskDraft>): TaskDraft | undefined {
    const { fields, values } = this.buildUpdateFields(data);

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    const stmt = this.db.prepare(`UPDATE task_drafts SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  updateIfStatus(
    id: string,
    expectedStatus: TaskDraftStatus,
    data: Partial<TaskDraft>
  ): TaskDraft | undefined {
    const { fields, values } = this.buildUpdateFields(data);

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id, expectedStatus);

    const stmt = this.db.prepare(
      `UPDATE task_drafts SET ${fields.join(', ')} WHERE id = ? AND status = ?`
    );
    const result = stmt.run(...values);
    if (result.changes <= 0) {
      return undefined;
    }
    return this.findById(id);
  }

  runInImmediateTransaction<T>(callback: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      throw error;
    }
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM task_drafts WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  private mapRowToTaskDraft(row: any): TaskDraft {
    return {
      id: row.id,
      candidateId: row.candidateId,
      targetId: row.targetId,
      taskType: row.taskType,
      accountIds: this.parseJsonArray(row.accountIds),
      templateId: row.templateId || undefined,
      config: this.parseJsonObject(row.config),
      priority: Number(row.priority || 5),
      status: row.status as TaskDraftStatus,
      confirmedTaskId: row.confirmedTaskId || undefined,
      reason: row.reason || undefined,
      runId: row.runId || undefined,
      sourceType: row.sourceType as DiscoverySourceType,
      indexBotUsername: row.indexBotUsername || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseJsonArray(raw: unknown): string[] {
    if (typeof raw !== 'string') {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  private parseJsonObject(raw: unknown): any {
    if (typeof raw !== 'string') {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private buildUpdateFields(data: Partial<TaskDraft>): {
    fields: string[];
    values: Array<string | number | null>;
  } {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (data.accountIds !== undefined) {
      fields.push('account_ids = ?');
      values.push(JSON.stringify(data.accountIds));
    }
    if (data.templateId !== undefined) {
      fields.push('template_id = ?');
      values.push(data.templateId || null);
    }
    if (data.config !== undefined) {
      fields.push('config = ?');
      values.push(JSON.stringify(data.config));
    }
    if (data.priority !== undefined) {
      fields.push('priority = ?');
      values.push(data.priority);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.confirmedTaskId !== undefined) {
      fields.push('confirmed_task_id = ?');
      values.push(data.confirmedTaskId || null);
    }
    if (data.reason !== undefined) {
      fields.push('reason = ?');
      values.push(data.reason || null);
    }

    return { fields, values };
  }
}
