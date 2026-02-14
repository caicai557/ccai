import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';

/**
 * 配置项接口
 */
export interface ConfigItem {
  key: string;
  value: string;
  updated_at: string;
}

/**
 * 配置数据访问对象
 */
export class ConfigDao extends BaseDao<ConfigItem> {
  constructor(db: Database.Database) {
    super(db);
    this.ensureConfigTable();
  }

  /**
   * 确保配置表存在
   */
  private ensureConfigTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * 查找所有配置项
   */
  findAll(): ConfigItem[] {
    const stmt = this.db.prepare('SELECT * FROM config');
    return stmt.all() as ConfigItem[];
  }

  /**
   * 根据key查找配置项
   */
  findById(key: string): ConfigItem | undefined {
    const stmt = this.db.prepare('SELECT * FROM config WHERE key = ?');
    return stmt.get(key) as ConfigItem | undefined;
  }

  /**
   * 根据key获取配置值
   */
  getValue(key: string): string | undefined {
    const config = this.findById(key);
    return config?.value;
  }

  /**
   * 创建配置项
   */
  create(data: Partial<ConfigItem>): ConfigItem {
    if (!data.key || !data.value) {
      throw new Error('配置项的key和value不能为空');
    }

    const now = this.now();
    const stmt = this.db.prepare(`
      INSERT INTO config (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(data.key, data.value, now);

    return {
      key: data.key,
      value: data.value,
      updated_at: now,
    };
  }

  /**
   * 更新配置项
   */
  update(key: string, data: Partial<ConfigItem>): ConfigItem | undefined {
    const existing = this.findById(key);
    if (!existing) {
      return undefined;
    }

    const now = this.now();
    const value = data.value ?? existing.value;

    const stmt = this.db.prepare(`
      UPDATE config
      SET value = ?, updated_at = ?
      WHERE key = ?
    `);

    stmt.run(value, now, key);

    return {
      key,
      value,
      updated_at: now,
    };
  }

  /**
   * 设置配置值（如果不存在则创建，存在则更新）
   */
  set(key: string, value: string): ConfigItem {
    const existing = this.findById(key);
    if (existing) {
      return this.update(key, { value })!;
    } else {
      return this.create({ key, value });
    }
  }

  /**
   * 删除配置项
   */
  delete(key: string): boolean {
    const stmt = this.db.prepare('DELETE FROM config WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * 批量设置配置项
   */
  setMany(configs: Record<string, string>): void {
    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(configs)) {
        this.set(key, value);
      }
    });

    transaction();
  }

  /**
   * 获取所有配置项作为对象
   */
  getAllAsObject(): Record<string, string> {
    const configs = this.findAll();
    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.key] = config.value;
    }
    return result;
  }

  /**
   * 清空所有配置项
   */
  clear(): void {
    this.db.exec('DELETE FROM config');
  }
}
