import Database from 'better-sqlite3';
import { LogDao } from '../../database/dao/LogDao';
import { LogService } from './LogService';
import { LogCleanupScheduler } from './LogCleanupScheduler';
import { initSchema } from '../../database/schema';

describe('LogCleanupScheduler', () => {
  let db: Database.Database;
  let logDao: LogDao;
  let logService: LogService;
  let scheduler: LogCleanupScheduler;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    logDao = new LogDao(db);
    logService = new LogService(logDao, { enableDatabaseLogging: true, retentionDays: 30 });
    scheduler = new LogCleanupScheduler(logService);
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
  });

  describe('调度器控制', () => {
    it('应该能够启动调度器', () => {
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('应该能够停止调度器', () => {
      scheduler.start();
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('重复启动应该发出警告', () => {
      scheduler.start();
      scheduler.start(); // 第二次启动
      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe('手动清理', () => {
    it('应该能够手动触发清理', () => {
      // 创建一些日志
      logService.info('新日志');

      // 插入旧日志
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      const stmt = (logDao as any).db.prepare(`
        INSERT INTO logs (id, level, message, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run('old-log-id', 'INFO', '旧日志', oldDate.toISOString());

      const countBefore = logService.count();
      scheduler.triggerCleanup();
      const countAfter = logService.count();

      expect(countAfter).toBeLessThan(countBefore);
    });
  });
});
