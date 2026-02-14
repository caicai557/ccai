import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';

/**
 * 速率记录接口
 */
export interface RateRecord {
  id: string;
  accountId: string;
  sentAt: number; // Unix时间戳（毫秒）
}

/**
 * FloodWait记录接口
 */
export interface FloodWaitRecord {
  accountId: string;
  waitUntil: number; // Unix时间戳（毫秒）
}

/**
 * 速率限制数据访问对象
 */
export class RateLimitDao extends BaseDao<RateRecord> {
  constructor(db: Database.Database) {
    super(db);
  }

  /**
   * 查找所有速率记录
   */
  findAll(): RateRecord[] {
    const stmt = this.db.prepare('SELECT * FROM rate_records ORDER BY sent_at DESC');
    return stmt.all() as RateRecord[];
  }

  /**
   * 根据ID查找速率记录
   */
  findById(id: string): RateRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM rate_records WHERE id = ?');
    return stmt.get(id) as RateRecord | undefined;
  }

  /**
   * 创建速率记录
   */
  create(data: Partial<RateRecord>): RateRecord {
    const record: RateRecord = {
      id: data.id || this.generateId(),
      accountId: data.accountId!,
      sentAt: data.sentAt || Date.now(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO rate_records (id, account_id, sent_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(record.id, record.accountId, record.sentAt);
    return record;
  }

  /**
   * 更新速率记录（通常不需要）
   */
  update(id: string, data: Partial<RateRecord>): RateRecord | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...data };
    const stmt = this.db.prepare(`
      UPDATE rate_records
      SET account_id = ?, sent_at = ?
      WHERE id = ?
    `);

    stmt.run(updated.accountId, updated.sentAt, id);
    return updated;
  }

  /**
   * 删除速率记录
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM rate_records WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 查找指定账号在指定时间之后的所有记录
   */
  findRecentByAccount(accountId: string, since: number): RateRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM rate_records
      WHERE account_id = ? AND sent_at >= ?
      ORDER BY sent_at DESC
    `);
    return stmt.all(accountId, since) as RateRecord[];
  }

  /**
   * 删除指定时间之前的记录
   */
  deleteOlderThan(timestamp: number): number {
    const stmt = this.db.prepare('DELETE FROM rate_records WHERE sent_at < ?');
    const result = stmt.run(timestamp);
    return result.changes;
  }

  /**
   * 删除指定账号的所有记录
   */
  deleteByAccount(accountId: string): number {
    const stmt = this.db.prepare('DELETE FROM rate_records WHERE account_id = ?');
    const result = stmt.run(accountId);
    return result.changes;
  }

  // FloodWait相关方法

  /**
   * 设置FloodWait记录
   */
  setFloodWait(accountId: string, waitUntil: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO flood_waits (account_id, wait_until)
      VALUES (?, ?)
    `);
    stmt.run(accountId, waitUntil);
  }

  /**
   * 获取FloodWait记录
   */
  getFloodWait(accountId: string): FloodWaitRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM flood_waits WHERE account_id = ?');
    const result = stmt.get(accountId) as any;
    if (!result) return undefined;

    return {
      accountId: result.account_id,
      waitUntil: result.wait_until,
    };
  }

  /**
   * 删除FloodWait记录
   */
  deleteFloodWait(accountId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM flood_waits WHERE account_id = ?');
    const result = stmt.run(accountId);
    return result.changes > 0;
  }

  /**
   * 删除已过期的FloodWait记录
   */
  deleteExpiredFloodWaits(): number {
    const now = Date.now();
    const stmt = this.db.prepare('DELETE FROM flood_waits WHERE wait_until <= ?');
    const result = stmt.run(now);
    return result.changes;
  }

  /**
   * 获取所有FloodWait记录
   */
  findAllFloodWaits(): FloodWaitRecord[] {
    const stmt = this.db.prepare('SELECT * FROM flood_waits');
    const results = stmt.all() as any[];
    return results.map((r) => ({
      accountId: r.account_id,
      waitUntil: r.wait_until,
    }));
  }
}
