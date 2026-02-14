import Database from 'better-sqlite3';

/**
 * 基础DAO类
 */
export abstract class BaseDao<T> {
  constructor(protected db: Database.Database) {}

  /**
   * 查找所有记录
   */
  abstract findAll(): T[];

  /**
   * 根据ID查找记录
   */
  abstract findById(id: string): T | undefined;

  /**
   * 创建记录
   */
  abstract create(data: Partial<T>): T;

  /**
   * 更新记录
   */
  abstract update(id: string, data: Partial<T>): T | undefined;

  /**
   * 删除记录
   */
  abstract delete(id: string): boolean;

  /**
   * 生成UUID
   */
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取当前时间戳
   */
  protected now(): string {
    return new Date().toISOString();
  }
}
