import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import {
  AccountProfileBatchJob,
  AccountProfileBatchJobStatus,
  AccountProfileJobSummary,
  AccountProfileThrottlePreset,
} from '../../types';

interface JobListQuery {
  status?: AccountProfileBatchJobStatus;
  page?: number;
  pageSize?: number;
}

const DEFAULT_SUMMARY: AccountProfileJobSummary = {
  total: 0,
  pending: 0,
  running: 0,
  success: 0,
  failed: 0,
  cancelled: 0,
  skipped: 0,
};

export class AccountProfileJobDao extends BaseDao<AccountProfileBatchJob> {
  private readonly baseSelect = `
    SELECT
      id,
      status,
      first_name_template AS firstNameTemplate,
      last_name_template AS lastNameTemplate,
      bio_template AS bioTemplate,
      avatar_files AS avatarFiles,
      throttle_preset AS throttlePreset,
      retry_limit AS retryLimit,
      summary,
      started_at AS startedAt,
      finished_at AS finishedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM account_profile_jobs
  `;

  constructor(db: Database.Database) {
    super(db);
  }

  findAll(): AccountProfileBatchJob[] {
    const rows = this.db.prepare(`${this.baseSelect} ORDER BY created_at DESC`).all() as any[];
    return rows.map((row) => this.mapRow(row));
  }

  list(query: JobListQuery): { items: AccountProfileBatchJob[]; total: number } {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM account_profile_jobs ${whereSql}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(`${this.baseSelect} ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as any[];

    return {
      items: rows.map((row) => this.mapRow(row)),
      total: Number(totalRow.count || 0),
    };
  }

  findById(id: string): AccountProfileBatchJob | undefined {
    const row = this.db.prepare(`${this.baseSelect} WHERE id = ?`).get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  findNextRunnable(): AccountProfileBatchJob | undefined {
    const row = this.db
      .prepare(
        `
          ${this.baseSelect}
          WHERE status IN ('pending', 'running')
          ORDER BY
            CASE status WHEN 'running' THEN 0 ELSE 1 END,
            datetime(created_at) ASC
          LIMIT 1
        `
      )
      .get() as any;
    return row ? this.mapRow(row) : undefined;
  }

  create(data: Partial<AccountProfileBatchJob>): AccountProfileBatchJob {
    const id = this.generateId();
    const now = this.now();
    const summary = this.normalizeSummary(data.summary);
    const avatarFiles = Array.isArray(data.avatarFiles)
      ? data.avatarFiles.map((item) => String(item))
      : [];

    this.db
      .prepare(
        `
          INSERT INTO account_profile_jobs (
            id, status, first_name_template, last_name_template, bio_template, avatar_files,
            throttle_preset, retry_limit, summary, started_at, finished_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        id,
        data.status || 'pending',
        data.firstNameTemplate || null,
        data.lastNameTemplate || null,
        data.bioTemplate || null,
        JSON.stringify(avatarFiles),
        data.throttlePreset || 'conservative',
        this.clampRetryLimit(data.retryLimit),
        JSON.stringify(summary),
        data.startedAt || null,
        data.finishedAt || null,
        now,
        now
      );

    const created = this.findById(id);
    if (!created) {
      throw new Error('创建账号资料批次失败');
    }
    return created;
  }

  update(id: string, data: Partial<AccountProfileBatchJob>): AccountProfileBatchJob | undefined {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.firstNameTemplate !== undefined) {
      fields.push('first_name_template = ?');
      values.push(data.firstNameTemplate || null);
    }
    if (data.lastNameTemplate !== undefined) {
      fields.push('last_name_template = ?');
      values.push(data.lastNameTemplate || null);
    }
    if (data.bioTemplate !== undefined) {
      fields.push('bio_template = ?');
      values.push(data.bioTemplate || null);
    }
    if (data.avatarFiles !== undefined) {
      fields.push('avatar_files = ?');
      values.push(JSON.stringify((data.avatarFiles || []).map((item) => String(item))));
    }
    if (data.throttlePreset !== undefined) {
      fields.push('throttle_preset = ?');
      values.push(data.throttlePreset);
    }
    if (data.retryLimit !== undefined) {
      fields.push('retry_limit = ?');
      values.push(this.clampRetryLimit(data.retryLimit));
    }
    if (data.summary !== undefined) {
      fields.push('summary = ?');
      values.push(JSON.stringify(this.normalizeSummary(data.summary)));
    }
    if (data.startedAt !== undefined) {
      fields.push('started_at = ?');
      values.push(data.startedAt || null);
    }
    if (data.finishedAt !== undefined) {
      fields.push('finished_at = ?');
      values.push(data.finishedAt || null);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    this.db
      .prepare(`UPDATE account_profile_jobs SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.findById(id);
  }

  markStarted(jobId: string): AccountProfileBatchJob | undefined {
    this.db
      .prepare(
        `
          UPDATE account_profile_jobs
          SET
            status = CASE WHEN status = 'pending' THEN 'running' ELSE status END,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      )
      .run(jobId);
    return this.findById(jobId);
  }

  updateStatus(
    jobId: string,
    status: AccountProfileBatchJobStatus
  ): AccountProfileBatchJob | undefined {
    this.db
      .prepare(
        `
          UPDATE account_profile_jobs
          SET
            status = ?,
            finished_at = CASE
              WHEN ? IN ('completed', 'cancelled', 'failed') THEN COALESCE(finished_at, CURRENT_TIMESTAMP)
              ELSE finished_at
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      )
      .run(status, status, jobId);
    return this.findById(jobId);
  }

  cleanupHistory(days: number): number {
    const safeDays = Math.max(1, Math.min(180, Number(days || 30)));
    const result = this.db
      .prepare(
        `
          DELETE FROM account_profile_jobs
          WHERE status IN ('completed', 'cancelled', 'failed')
            AND datetime(created_at) < datetime('now', ?)
        `
      )
      .run(`-${safeDays} day`);
    return result.changes;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM account_profile_jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapRow(row: any): AccountProfileBatchJob {
    return {
      id: row.id,
      status: row.status as AccountProfileBatchJobStatus,
      firstNameTemplate: row.firstNameTemplate || undefined,
      lastNameTemplate: row.lastNameTemplate || undefined,
      bioTemplate: row.bioTemplate || undefined,
      avatarFiles: this.parseStringArray(row.avatarFiles),
      throttlePreset: (row.throttlePreset || 'conservative') as AccountProfileThrottlePreset,
      retryLimit: this.clampRetryLimit(Number(row.retryLimit ?? 1)),
      summary: this.normalizeSummary(this.parseSummary(row.summary)),
      startedAt: row.startedAt || undefined,
      finishedAt: row.finishedAt || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseStringArray(raw: unknown): string[] {
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

  private parseSummary(raw: unknown): Partial<AccountProfileJobSummary> {
    if (typeof raw !== 'string') {
      return DEFAULT_SUMMARY;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return DEFAULT_SUMMARY;
      }
      return parsed as Partial<AccountProfileJobSummary>;
    } catch {
      return DEFAULT_SUMMARY;
    }
  }

  private normalizeSummary(summary?: Partial<AccountProfileJobSummary>): AccountProfileJobSummary {
    return {
      total: Number(summary?.total || 0),
      pending: Number(summary?.pending || 0),
      running: Number(summary?.running || 0),
      success: Number(summary?.success || 0),
      failed: Number(summary?.failed || 0),
      cancelled: Number(summary?.cancelled || 0),
      skipped: Number(summary?.skipped || 0),
    };
  }

  private clampRetryLimit(retryLimit: unknown): number {
    const numeric = Number(retryLimit ?? 1);
    if (!Number.isFinite(numeric)) {
      return 1;
    }
    return Math.max(0, Math.min(3, Math.floor(numeric)));
  }
}
