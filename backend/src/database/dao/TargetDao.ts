import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { Target } from '../../types';

/**
 * 目标（群组/频道）数据访问对象
 */
export class TargetDao extends BaseDao<Target> {
  private readonly baseSelect = `
    SELECT
      id,
      type,
      telegram_id AS telegramId,
      title,
      enabled,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM targets
  `;

  constructor(db: Database.Database) {
    super(db);
  }

  findAll(): Target[] {
    const stmt = this.db.prepare(`${this.baseSelect} ORDER BY createdAt DESC`);
    return stmt.all() as Target[];
  }

  findById(id: string): Target | undefined {
    const stmt = this.db.prepare(`${this.baseSelect} WHERE id = ?`);
    return stmt.get(id) as Target | undefined;
  }

  /**
   * 根据类型查找目标
   */
  findByType(type: 'group' | 'channel'): Target[] {
    const stmt = this.db.prepare(`${this.baseSelect} WHERE type = ? ORDER BY createdAt DESC`);
    return stmt.all(type) as Target[];
  }

  /**
   * 查找启用的目标
   */
  findEnabled(): Target[] {
    const stmt = this.db.prepare(`${this.baseSelect} WHERE enabled = 1 ORDER BY createdAt DESC`);
    return stmt.all() as Target[];
  }

  create(data: Partial<Target>): Target {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO targets (id, type, telegram_id, title, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.type,
      data.telegramId,
      data.title,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      now,
      now
    );

    return this.findById(id)!;
  }

  update(id: string, data: Partial<Target>): Target | undefined {
    const now = this.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE targets SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM targets WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
