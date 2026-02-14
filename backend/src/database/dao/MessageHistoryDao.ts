import { BaseDao } from './BaseDao';

/**
 * 消息历史记录
 */
export interface MessageHistory {
  id: string;
  accountId: string;
  targetId: string;
  type: 'group_message' | 'channel_comment';
  content: string;
  status: 'success' | 'failed';
  error?: string;
  sentAt: string;
}

/**
 * 消息历史查询过滤器
 */
export interface MessageHistoryFilter {
  accountId?: string;
  targetId?: string;
  type?: 'group_message' | 'channel_comment';
  status?: 'success' | 'failed';
  startDate?: Date;
  endDate?: Date;
}

/**
 * 消息历史统计
 */
export interface MessageHistoryStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

/**
 * 消息历史数据访问对象
 */
export class MessageHistoryDao extends BaseDao<MessageHistory> {
  private readonly baseSelect = `
    SELECT
      id,
      account_id AS accountId,
      target_id AS targetId,
      type,
      content,
      status,
      error,
      sent_at AS sentAt
    FROM message_history
  `;

  /**
   * 查找所有消息历史
   */
  findAll(): MessageHistory[] {
    const stmt = this.db.prepare(`
      ${this.baseSelect}
      ORDER BY sent_at DESC
    `);

    return this.mapRows(stmt.all() as any[]);
  }

  /**
   * 根据ID查找消息历史
   */
  findById(id: string): MessageHistory | undefined {
    const stmt = this.db.prepare(`
      ${this.baseSelect}
      WHERE id = ?
    `);

    return this.mapRow(stmt.get(id) as any);
  }

  /**
   * 创建消息历史记录
   */
  create(data: Partial<MessageHistory>): MessageHistory {
    const id = data.id || this.generateId();
    const sentAt = data.sentAt || this.now();

    const stmt = this.db.prepare(`
      INSERT INTO message_history (
        id, account_id, target_id, type, content, status, error, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.accountId,
      data.targetId,
      data.type,
      data.content,
      data.status,
      data.error || null,
      sentAt
    );

    return this.findById(id)!;
  }

  /**
   * 更新消息历史记录
   */
  update(id: string, data: Partial<MessageHistory>): MessageHistory | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (data.error !== undefined) {
      updates.push('error = ?');
      values.push(data.error);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE message_history 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * 删除消息历史记录
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM message_history 
      WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 根据过滤条件查找消息历史
   */
  findByFilter(filter: MessageHistoryFilter, limit?: number, offset?: number): MessageHistory[] {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter.accountId) {
      conditions.push('account_id = ?');
      values.push(filter.accountId);
    }

    if (filter.targetId) {
      conditions.push('target_id = ?');
      values.push(filter.targetId);
    }

    if (filter.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }

    if (filter.status) {
      conditions.push('status = ?');
      values.push(filter.status);
    }

    if (filter.startDate) {
      conditions.push('sent_at >= ?');
      values.push(filter.startDate.toISOString());
    }

    if (filter.endDate) {
      conditions.push('sent_at <= ?');
      values.push(filter.endDate.toISOString());
    }

    let sql = this.baseSelect;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY sent_at DESC';

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      values.push(limit);

      if (offset !== undefined) {
        sql += ' OFFSET ?';
        values.push(offset);
      }
    }

    const stmt = this.db.prepare(sql);
    return this.mapRows(stmt.all(...values) as any[]);
  }

  /**
   * 根据账号ID查找消息历史
   */
  findByAccountId(accountId: string, limit?: number): MessageHistory[] {
    return this.findByFilter({ accountId }, limit);
  }

  /**
   * 根据目标ID查找消息历史
   */
  findByTargetId(targetId: string, limit?: number): MessageHistory[] {
    return this.findByFilter({ targetId }, limit);
  }

  /**
   * 查找最近的消息历史
   */
  findRecent(limit: number = 100): MessageHistory[] {
    const stmt = this.db.prepare(`
      ${this.baseSelect}
      ORDER BY sent_at DESC 
      LIMIT ?
    `);

    return this.mapRows(stmt.all(limit) as any[]);
  }

  /**
   * 统计消息历史
   */
  getStats(filter?: MessageHistoryFilter): MessageHistoryStats {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter?.accountId) {
      conditions.push('account_id = ?');
      values.push(filter.accountId);
    }

    if (filter?.targetId) {
      conditions.push('target_id = ?');
      values.push(filter.targetId);
    }

    if (filter?.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }

    if (filter?.startDate) {
      conditions.push('sent_at >= ?');
      values.push(filter.startDate.toISOString());
    }

    if (filter?.endDate) {
      conditions.push('sent_at <= ?');
      values.push(filter.endDate.toISOString());
    }

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM message_history
    `;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...values) as any;

    const total = result.total || 0;
    const success = result.success || 0;
    const failed = result.failed || 0;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      successRate,
    };
  }

  /**
   * 获取账号的消息统计
   */
  getAccountStats(accountId: string, days?: number): MessageHistoryStats {
    const filter: MessageHistoryFilter = { accountId };

    if (days !== undefined) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      filter.startDate = startDate;
    }

    return this.getStats(filter);
  }

  /**
   * 获取目标的消息统计
   */
  getTargetStats(targetId: string, days?: number): MessageHistoryStats {
    const filter: MessageHistoryFilter = { targetId };

    if (days !== undefined) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      filter.startDate = startDate;
    }

    return this.getStats(filter);
  }

  /**
   * 删除指定日期之前的消息历史
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare(`
      DELETE FROM message_history 
      WHERE sent_at < ?
    `);

    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * 删除指定天数之前的消息历史
   */
  deleteOlderThanDays(days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return this.deleteOlderThan(cutoffDate);
  }

  /**
   * 删除账号的所有消息历史
   */
  deleteByAccountId(accountId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM message_history 
      WHERE account_id = ?
    `);

    const result = stmt.run(accountId);
    return result.changes;
  }

  /**
   * 删除目标的所有消息历史
   */
  deleteByTargetId(targetId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM message_history 
      WHERE target_id = ?
    `);

    const result = stmt.run(targetId);
    return result.changes;
  }

  /**
   * 统计消息总数
   */
  count(filter?: MessageHistoryFilter): number {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter?.accountId) {
      conditions.push('account_id = ?');
      values.push(filter.accountId);
    }

    if (filter?.targetId) {
      conditions.push('target_id = ?');
      values.push(filter.targetId);
    }

    if (filter?.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }

    if (filter?.status) {
      conditions.push('status = ?');
      values.push(filter.status);
    }

    if (filter?.startDate) {
      conditions.push('sent_at >= ?');
      values.push(filter.startDate.toISOString());
    }

    if (filter?.endDate) {
      conditions.push('sent_at <= ?');
      values.push(filter.endDate.toISOString());
    }

    let sql = 'SELECT COUNT(*) as count FROM message_history';

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...values) as any;

    return result.count || 0;
  }

  /**
   * 检查是否存在指定条件的消息历史
   */
  exists(filter: MessageHistoryFilter): boolean {
    return this.count(filter) > 0;
  }

  /**
   * 获取最后一条消息历史
   */
  findLast(filter?: MessageHistoryFilter): MessageHistory | undefined {
    const results = this.findByFilter(filter || {}, 1);
    return results.length > 0 ? results[0] : undefined;
  }

  /**
   * 批量创建消息历史记录
   */
  createBatch(records: Partial<MessageHistory>[]): MessageHistory[] {
    const stmt = this.db.prepare(`
      INSERT INTO message_history (
        id, account_id, target_id, type, content, status, error, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((records: Partial<MessageHistory>[]) => {
      for (const record of records) {
        const id = record.id || this.generateId();
        const sentAt = record.sentAt || this.now();

        stmt.run(
          id,
          record.accountId,
          record.targetId,
          record.type,
          record.content,
          record.status,
          record.error || null,
          sentAt
        );
      }
    });

    insertMany(records);

    // 返回最近创建的记录
    return this.findRecent(records.length);
  }

  private mapRows(rows: any[]): MessageHistory[] {
    return rows.map((row) => this.mapRow(row)!);
  }

  private mapRow(row: any): MessageHistory | undefined {
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      accountId: row.accountId,
      targetId: row.targetId,
      type: row.type,
      content: row.content,
      status: row.status,
      error: row.error ?? undefined,
      sentAt: row.sentAt,
    };
  }
}
