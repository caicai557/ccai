import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { AccountProfileBatchItemStatus, AccountProfileBatchJobItem } from '../../types';

export class AccountProfileJobItemDao extends BaseDao<AccountProfileBatchJobItem> {
  private readonly baseSelect = `
    SELECT
      items.id,
      items.job_id AS jobId,
      items.account_id AS accountId,
      accounts.phone_number AS accountPhoneNumber,
      items.item_index AS itemIndex,
      items.status,
      items.attempt,
      items.max_attempts AS maxAttempts,
      items.error_code AS errorCode,
      items.error_message AS errorMessage,
      items.applied_first_name AS appliedFirstName,
      items.applied_last_name AS appliedLastName,
      items.applied_bio AS appliedBio,
      items.avatar_file AS avatarFile,
      items.started_at AS startedAt,
      items.finished_at AS finishedAt,
      items.created_at AS createdAt,
      items.updated_at AS updatedAt
    FROM account_profile_job_items items
    LEFT JOIN accounts ON accounts.id = items.account_id
  `;

  constructor(db: Database.Database) {
    super(db);
  }

  findAll(): AccountProfileBatchJobItem[] {
    const rows = this.db
      .prepare(`${this.baseSelect} ORDER BY datetime(items.created_at) DESC`)
      .all() as any[];
    return rows.map((row) => this.mapRow(row));
  }

  findById(id: string): AccountProfileBatchJobItem | undefined {
    const row = this.db.prepare(`${this.baseSelect} WHERE items.id = ?`).get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  findByJobId(jobId: string): AccountProfileBatchJobItem[] {
    const rows = this.db
      .prepare(`${this.baseSelect} WHERE items.job_id = ? ORDER BY items.item_index ASC`)
      .all(jobId) as any[];
    return rows.map((row) => this.mapRow(row));
  }

  findNextPendingItem(jobId: string): AccountProfileBatchJobItem | undefined {
    const row = this.db
      .prepare(
        `
          ${this.baseSelect}
          WHERE items.job_id = ?
            AND items.status = 'pending'
          ORDER BY items.item_index ASC
          LIMIT 1
        `
      )
      .get(jobId) as any;
    return row ? this.mapRow(row) : undefined;
  }

  findNextPendingJobId(): string | undefined {
    const row = this.db
      .prepare(
        `
          SELECT items.job_id AS jobId
          FROM account_profile_job_items items
          INNER JOIN account_profile_jobs jobs ON jobs.id = items.job_id
          WHERE items.status = 'pending'
            AND jobs.status IN ('pending', 'running')
          ORDER BY datetime(jobs.created_at) ASC, items.item_index ASC
          LIMIT 1
        `
      )
      .get() as { jobId: string } | undefined;
    return row?.jobId;
  }

  createMany(
    rows: Array<{
      jobId: string;
      accountId: string;
      itemIndex: number;
      status: AccountProfileBatchItemStatus;
      maxAttempts: number;
      avatarFile?: string;
      errorCode?: string;
      errorMessage?: string;
    }>
  ): void {
    if (rows.length === 0) {
      return;
    }

    const now = this.now();
    const stmt = this.db.prepare(`
      INSERT INTO account_profile_job_items (
        id, job_id, account_id, item_index, status, attempt, max_attempts,
        avatar_file, error_code, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(
      (
        payload: Array<{
          jobId: string;
          accountId: string;
          itemIndex: number;
          status: AccountProfileBatchItemStatus;
          maxAttempts: number;
          avatarFile?: string;
          errorCode?: string;
          errorMessage?: string;
        }>
      ) => {
        for (const item of payload) {
          stmt.run(
            this.generateId(),
            item.jobId,
            item.accountId,
            item.itemIndex,
            item.status,
            Math.max(1, Number(item.maxAttempts || 1)),
            item.avatarFile || null,
            item.errorCode || null,
            item.errorMessage || null,
            now,
            now
          );
        }
      }
    );

    insertMany(rows);
  }

  create(data: Partial<AccountProfileBatchJobItem>): AccountProfileBatchJobItem {
    const id = this.generateId();
    const now = this.now();
    this.db
      .prepare(
        `
          INSERT INTO account_profile_job_items (
            id, job_id, account_id, item_index, status, attempt, max_attempts,
            error_code, error_message, applied_first_name, applied_last_name, applied_bio,
            avatar_file, started_at, finished_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        id,
        data.jobId,
        data.accountId,
        Number(data.itemIndex || 1),
        data.status || 'pending',
        Number(data.attempt || 0),
        Math.max(1, Number(data.maxAttempts || 2)),
        data.errorCode || null,
        data.errorMessage || null,
        data.appliedFirstName || null,
        data.appliedLastName || null,
        data.appliedBio || null,
        data.avatarFile || null,
        data.startedAt || null,
        data.finishedAt || null,
        now,
        now
      );
    const created = this.findById(id);
    if (!created) {
      throw new Error('创建账号资料批次任务项失败');
    }
    return created;
  }

  update(
    id: string,
    data: Partial<AccountProfileBatchJobItem>
  ): AccountProfileBatchJobItem | undefined {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.attempt !== undefined) {
      fields.push('attempt = ?');
      values.push(Number(data.attempt || 0));
    }
    if (data.maxAttempts !== undefined) {
      fields.push('max_attempts = ?');
      values.push(Math.max(1, Number(data.maxAttempts || 1)));
    }
    if (data.errorCode !== undefined) {
      fields.push('error_code = ?');
      values.push(data.errorCode || null);
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(data.errorMessage || null);
    }
    if (data.appliedFirstName !== undefined) {
      fields.push('applied_first_name = ?');
      values.push(data.appliedFirstName || null);
    }
    if (data.appliedLastName !== undefined) {
      fields.push('applied_last_name = ?');
      values.push(data.appliedLastName || null);
    }
    if (data.appliedBio !== undefined) {
      fields.push('applied_bio = ?');
      values.push(data.appliedBio || null);
    }
    if (data.avatarFile !== undefined) {
      fields.push('avatar_file = ?');
      values.push(data.avatarFile || null);
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
      .prepare(`UPDATE account_profile_job_items SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.findById(id);
  }

  markRunning(itemId: string, attempt: number): AccountProfileBatchJobItem | undefined {
    this.db
      .prepare(
        `
          UPDATE account_profile_job_items
          SET
            status = 'running',
            attempt = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            error_code = NULL,
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `
      )
      .run(attempt, itemId);
    return this.findById(itemId);
  }

  cancelPendingByJobId(jobId: string): number {
    const result = this.db
      .prepare(
        `
          UPDATE account_profile_job_items
          SET
            status = 'cancelled',
            error_message = COALESCE(NULLIF(error_message, ''), '任务已取消'),
            finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = ? AND status = 'pending'
        `
      )
      .run(jobId);
    return result.changes;
  }

  getSummaryByJobId(jobId: string): {
    total: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
    skipped: number;
  } {
    const row = this.db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
          FROM account_profile_job_items
          WHERE job_id = ?
        `
      )
      .get(jobId) as Record<string, number | null>;

    return {
      total: Number(row['total'] || 0),
      pending: Number(row['pending'] || 0),
      running: Number(row['running'] || 0),
      success: Number(row['success'] || 0),
      failed: Number(row['failed'] || 0),
      cancelled: Number(row['cancelled'] || 0),
      skipped: Number(row['skipped'] || 0),
    };
  }

  delete(id: string): boolean {
    return (
      this.db.prepare('DELETE FROM account_profile_job_items WHERE id = ?').run(id).changes > 0
    );
  }

  private mapRow(row: any): AccountProfileBatchJobItem {
    return {
      id: row.id,
      jobId: row.jobId,
      accountId: row.accountId,
      accountPhoneNumber: row.accountPhoneNumber || undefined,
      itemIndex: Number(row.itemIndex || 1),
      status: row.status as AccountProfileBatchItemStatus,
      attempt: Number(row.attempt || 0),
      maxAttempts: Number(row.maxAttempts || 1),
      errorCode: row.errorCode || undefined,
      errorMessage: row.errorMessage || undefined,
      appliedFirstName: row.appliedFirstName || undefined,
      appliedLastName: row.appliedLastName || undefined,
      appliedBio: row.appliedBio || undefined,
      avatarFile: row.avatarFile || undefined,
      startedAt: row.startedAt || undefined,
      finishedAt: row.finishedAt || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
