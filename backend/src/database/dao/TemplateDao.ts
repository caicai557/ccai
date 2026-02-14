import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { Template } from '../../types';

/**
 * 模板数据访问对象
 */
export class TemplateDao extends BaseDao<Template> {
  constructor(db: Database.Database) {
    super(db);
  }

  findAll(): Template[] {
    const stmt = this.db.prepare('SELECT * FROM templates ORDER BY created_at DESC');
    return stmt.all() as Template[];
  }

  findById(id: string): Template | undefined {
    const stmt = this.db.prepare('SELECT * FROM templates WHERE id = ?');
    return stmt.get(id) as Template | undefined;
  }

  /**
   * 根据分类查找模板
   */
  findByCategory(category: 'group_message' | 'channel_comment'): Template[] {
    const stmt = this.db.prepare(
      'SELECT * FROM templates WHERE category = ? ORDER BY created_at DESC'
    );
    return stmt.all(category) as Template[];
  }

  /**
   * 查找启用的模板
   */
  findEnabled(category?: string): Template[] {
    let sql = 'SELECT * FROM templates WHERE enabled = 1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Template[];
  }

  create(data: Partial<Template>): Template {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO templates (id, category, content, enabled, weight, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.category,
      data.content,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      data.weight || 1,
      now,
      now
    );

    return this.findById(id)!;
  }

  update(id: string, data: Partial<Template>): Template | undefined {
    const now = this.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(data.content);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }
    if (data.weight !== undefined) {
      fields.push('weight = ?');
      values.push(data.weight);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM templates WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 递增模板使用计数
   */
  incrementUsageCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE templates 
      SET usage_count = COALESCE(usage_count, 0) + 1 
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * 获取模板使用计数
   */
  getUsageCount(id: string): number {
    const stmt = this.db.prepare(
      'SELECT COALESCE(usage_count, 0) as count FROM templates WHERE id = ?'
    );
    const result = stmt.get(id) as { count: number } | undefined;
    return result?.count || 0;
  }
}
