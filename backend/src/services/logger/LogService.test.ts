import Database from 'better-sqlite3';
import { LogDao } from '../../database/dao/LogDao';
import { LogService } from './LogService';
import { initSchema } from '../../database/schema';

describe('LogService', () => {
  let db: Database.Database;
  let logDao: LogDao;
  let logService: LogService;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    initSchema(db);
    logDao = new LogDao(db);
    logService = new LogService(logDao, { enableDatabaseLogging: true });
  });

  afterEach(() => {
    db.close();
  });

  describe('日志记录', () => {
    it('应该记录INFO级别日志', () => {
      logService.info('测试消息');
      const logs = logService.getRecent(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('INFO');
      expect(logs[0].message).toBe('测试消息');
    });

    it('应该记录WARN级别日志', () => {
      logService.warn('警告消息');
      const logs = logService.getRecent(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('WARN');
    });

    it('应该记录ERROR级别日志', () => {
      logService.error('错误消息');
      const logs = logService.getRecent(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('ERROR');
    });

    it('应该记录DEBUG级别日志', () => {
      logService.debug('调试消息');
      const logs = logService.getRecent(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('DEBUG');
    });

    it('应该记录带账号ID的日志', () => {
      logService.info('测试消息', 'account-123');
      const logs = logService.getRecent(10);
      expect(logs[0].accountId).toBe('account-123');
    });

    it('应该记录带任务ID的日志', () => {
      logService.info('测试消息', undefined, 'task-456');
      const logs = logService.getRecent(10);
      expect(logs[0].taskId).toBe('task-456');
    });

    it('应该记录带详情的日志', () => {
      const details = { error: '测试错误', code: 500 };
      logService.error('错误消息', undefined, undefined, details);
      const logs = logService.getRecent(10);
      expect(logs[0].details).toBe(JSON.stringify(details));
    });
  });

  describe('日志查询', () => {
    beforeEach(() => {
      // 创建测试数据
      logService.info('消息1', 'account-1', 'task-1');
      logService.warn('消息2', 'account-1', 'task-2');
      logService.error('消息3', 'account-2', 'task-1');
      logService.debug('消息4', 'account-2', 'task-2');
    });

    it('应该查询所有日志', () => {
      const logs = logService.query();
      expect(logs.length).toBeGreaterThanOrEqual(4);
    });

    it('应该按级别过滤日志', () => {
      const logs = logService.query({ level: 'ERROR' });
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('消息3');
    });

    it('应该按账号ID过滤日志', () => {
      const logs = logService.query({ accountId: 'account-1' });
      expect(logs).toHaveLength(2);
      expect(logs.every((log) => log.accountId === 'account-1')).toBe(true);
    });

    it('应该按任务ID过滤日志', () => {
      const logs = logService.query({ taskId: 'task-1' });
      expect(logs).toHaveLength(2);
      expect(logs.every((log) => log.taskId === 'task-1')).toBe(true);
    });

    it('应该按时间范围过滤日志', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const logs = logService.query({
        startDate: oneHourAgo,
        endDate: now,
      });
      expect(logs.length).toBeGreaterThanOrEqual(4);
    });

    it('应该支持组合过滤条件', () => {
      const logs = logService.query({
        level: 'INFO',
        accountId: 'account-1',
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('消息1');
    });

    it('应该支持分页查询', () => {
      const page1 = logService.query({}, 2, 0);
      const page2 = logService.query({}, 2, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('应该统计日志数量', () => {
      const count = logService.count();
      expect(count).toBeGreaterThanOrEqual(4);
    });

    it('应该统计过滤后的日志数量', () => {
      const count = logService.count({ level: 'ERROR' });
      expect(count).toBe(1);
    });
  });

  describe('日志导出', () => {
    beforeEach(() => {
      logService.info('测试消息1');
      logService.warn('测试消息2');
    });

    it('应该导出为JSON格式', () => {
      const json = logService.export({}, 'json');
      const logs = JSON.parse(json);
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('应该导出为CSV格式', () => {
      const csv = logService.export({}, 'csv');
      const lines = csv.split('\n');
      expect(lines[0]).toContain('ID');
      expect(lines[0]).toContain('级别');
      expect(lines.length).toBeGreaterThan(2);
    });

    it('CSV应该正确转义包含逗号的值', () => {
      logService.info('消息包含,逗号');
      const csv = logService.export({}, 'csv');
      expect(csv).toContain('"消息包含,逗号"');
    });
  });

  describe('日志清理', () => {
    it('应该清理过期日志', () => {
      // 创建一些日志
      logService.info('新日志');

      // 手动插入一条旧日志（直接使用DAO）
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      // 直接使用SQL插入旧日志
      const stmt = (logDao as any).db.prepare(`
        INSERT INTO logs (id, level, message, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run('old-log-id', 'INFO', '旧日志', oldDate.toISOString());

      const countBefore = logService.count();
      const deletedCount = logService.cleanup();

      expect(deletedCount).toBeGreaterThan(0);
      const countAfter = logService.count();
      expect(countAfter).toBeLessThan(countBefore);
    });

    it('应该保留未过期的日志', () => {
      logService.info('新日志1');
      logService.info('新日志2');

      const countBefore = logService.count();
      logService.cleanup();
      const countAfter = logService.count();

      expect(countAfter).toBe(countBefore);
    });
  });

  describe('配置管理', () => {
    it('应该使用默认配置', () => {
      const config = logService.getConfig();
      expect(config.retentionDays).toBe(30);
      expect(config.enableDatabaseLogging).toBe(true);
    });

    it('应该更新配置', () => {
      logService.updateConfig({ retentionDays: 60 });
      const config = logService.getConfig();
      expect(config.retentionDays).toBe(60);
    });
  });
});
