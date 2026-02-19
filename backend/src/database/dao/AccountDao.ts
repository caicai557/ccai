import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { Account, AccountPoolStatus } from '../../types';

/**
 * 账号数据访问对象
 */
export class AccountDao extends BaseDao<Account> {
  constructor(db: Database.Database) {
    super(db);
  }

  /**
   * 查找所有账号
   */
  findAll(poolStatus?: AccountPoolStatus): Account[] {
    const hasPoolFilter = Boolean(poolStatus);
    const stmt = this.db.prepare(
      hasPoolFilter
        ? 'SELECT * FROM accounts WHERE pool_status = ? ORDER BY created_at DESC'
        : 'SELECT * FROM accounts ORDER BY created_at DESC'
    );
    const rows = (hasPoolFilter ? stmt.all(poolStatus) : stmt.all()) as any[];
    return rows.map((row) => this.mapRowToAccount(row));
  }

  /**
   * 根据ID查找账号
   */
  findById(id: string): Account | undefined {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRowToAccount(row);
  }

  /**
   * 根据手机号查找账号
   */
  findByPhoneNumber(phoneNumber: string): Account | undefined {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE phone_number = ?');
    const row = stmt.get(phoneNumber) as any;
    if (!row) return undefined;
    return this.mapRowToAccount(row);
  }

  /**
   * 将数据库行映射为 Account 对象
   * 处理蛇形命名到驼峰命名的转换
   */
  private mapRowToAccount(row: any): Account {
    const lastActive = row.last_active ? new Date(row.last_active) : new Date(row.updated_at);

    return {
      id: row.id,
      phoneNumber: row.phone_number,
      session: row.session,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      addMethod: row.add_method,
      status: row.status,
      poolStatus: (row.pool_status || 'ok') as AccountPoolStatus,
      poolStatusUpdatedAt: new Date(row.pool_status_updated_at || row.updated_at),
      healthScore: row.health_score,
      lastActive,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * 创建账号
   */
  create(data: Partial<Account>): Account {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO accounts (
        id, phone_number, session, username, first_name, last_name, 
        add_method, status, pool_status, pool_status_updated_at, last_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.phoneNumber,
      data.session,
      data.username || null,
      data.firstName || null,
      data.lastName || null,
      data.addMethod || 'phone',
      data.status || 'offline',
      data.poolStatus || 'ok',
      data.poolStatusUpdatedAt || now,
      data.lastActive || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * 更新账号
   */
  update(id: string, data: Partial<Account>): Account | undefined {
    const now = this.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.session !== undefined) {
      fields.push('session = ?');
      values.push(data.session);
    }
    if (data.username !== undefined) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.firstName !== undefined) {
      fields.push('first_name = ?');
      values.push(data.firstName);
    }
    if (data.lastName !== undefined) {
      fields.push('last_name = ?');
      values.push(data.lastName);
    }
    if (data.addMethod !== undefined) {
      fields.push('add_method = ?');
      values.push(data.addMethod);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.lastActive !== undefined) {
      fields.push('last_active = ?');
      values.push(data.lastActive);
    }
    if (data.healthScore !== undefined) {
      fields.push('health_score = ?');
      values.push(data.healthScore);
    }
    if (data.poolStatus !== undefined) {
      fields.push('pool_status = ?');
      values.push(data.poolStatus);
    }
    if (data.poolStatusUpdatedAt !== undefined) {
      fields.push('pool_status_updated_at = ?');
      values.push(data.poolStatusUpdatedAt);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * 删除账号
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM accounts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 更新账号状态
   */
  updateStatus(id: string, status: 'online' | 'offline' | 'restricted'): boolean {
    const stmt = this.db.prepare(
      'UPDATE accounts SET status = ?, last_active = ?, updated_at = ? WHERE id = ?'
    );
    const result = stmt.run(status, this.now(), this.now(), id);
    return result.changes > 0;
  }

  /**
   * 更新账号池运营状态
   */
  updatePoolStatus(id: string, poolStatus: AccountPoolStatus): boolean {
    const stmt = this.db.prepare(
      'UPDATE accounts SET pool_status = ?, pool_status_updated_at = ?, updated_at = ? WHERE id = ?'
    );
    const now = this.now();
    const result = stmt.run(poolStatus, now, now, id);
    return result.changes > 0;
  }
}
