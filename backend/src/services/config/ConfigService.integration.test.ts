import Database from 'better-sqlite3';
import { ConfigService, ConfigValidationError } from './ConfigService';
import path from 'path';
import fs from 'fs';

describe('ConfigService 集成测试', () => {
  let dbPath: string;
  let db: Database.Database;
  let configService: ConfigService;

  beforeEach(() => {
    // 使用临时文件数据库
    dbPath = path.join(__dirname, `test-${Date.now()}.db`);
    db = new Database(dbPath);
    configService = new ConfigService(db);
  });

  afterEach(() => {
    db.close();
    // 清理测试数据库文件
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('配置持久化', () => {
    it('应该在数据库重启后保持配置', () => {
      // 更新配置
      configService.updateConfig({
        rateLimit: {
          maxPerSecond: 2,
          maxPerHour: 50,
          maxPerDay: 300,
          minDelayMs: 2000,
          maxDelayMs: 5000,
        },
        log: {
          retentionDays: 60,
        },
        websocket: {
          port: 4001,
        },
        api: {
          port: 4000,
        },
      });

      // 关闭数据库
      db.close();

      // 重新打开数据库
      db = new Database(dbPath);
      const newConfigService = new ConfigService(db);

      // 验证配置已持久化
      const config = newConfigService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(2);
      expect(config.rateLimit.maxPerHour).toBe(50);
      expect(config.rateLimit.maxPerDay).toBe(300);
      expect(config.log.retentionDays).toBe(60);
      expect(config.websocket.port).toBe(4001);
      expect(config.api.port).toBe(4000);
    });

    it('应该支持部分配置更新', () => {
      // 第一次更新
      configService.updateConfig({
        rateLimit: { maxPerSecond: 2 },
      });

      // 第二次更新不同的配置项
      configService.updateConfig({
        log: { retentionDays: 60 },
      });

      // 验证两次更新都生效
      const config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(2);
      expect(config.log.retentionDays).toBe(60);
    });

    it('应该支持多次更新同一配置项', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 2 },
      });

      configService.updateConfig({
        rateLimit: { maxPerSecond: 3 },
      });

      const config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(3);
    });
  });

  describe('配置验证完整性', () => {
    it('应该验证所有速率限制参数', () => {
      // 测试边界值
      expect(() => {
        configService.updateConfig({
          rateLimit: {
            maxPerSecond: 0,
            maxPerHour: 0,
            maxPerDay: 0,
            minDelayMs: 0,
            maxDelayMs: 0,
          },
        });
      }).not.toThrow();

      expect(() => {
        configService.updateConfig({
          rateLimit: {
            maxPerSecond: 10,
            maxPerHour: 100,
            maxPerDay: 1000,
            minDelayMs: 10000,
            maxDelayMs: 30000,
          },
        });
      }).not.toThrow();
    });

    it('应该在验证失败时不修改配置', () => {
      const originalConfig = configService.getConfig();

      try {
        configService.updateConfig({
          rateLimit: { maxPerSecond: -1 },
        });
      } catch (error) {
        // 预期会抛出错误
      }

      const currentConfig = configService.getConfig();
      expect(currentConfig).toEqual(originalConfig);
    });

    it('应该提供清晰的验证错误消息', () => {
      expect(() => {
        configService.updateConfig({
          rateLimit: { maxPerSecond: -1 },
        });
      }).toThrow('每秒最大消息数必须在0-10之间');

      expect(() => {
        configService.updateConfig({
          log: { retentionDays: 0 },
        });
      }).toThrow('日志保留天数必须在1-365之间');

      expect(() => {
        configService.updateConfig({
          websocket: { port: 80 },
        });
      }).toThrow('WebSocket端口必须在1024-65535之间');

      expect(() => {
        configService.updateConfig({
          database: { path: '' },
        });
      }).toThrow('数据库路径不能为空');
    });
  });

  describe('配置重置', () => {
    it('应该完全重置配置并持久化', () => {
      // 修改多个配置项
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
        websocket: { port: 5001 },
      });

      // 重置配置
      configService.resetConfig();

      // 关闭并重新打开数据库
      db.close();
      db = new Database(dbPath);
      const newConfigService = new ConfigService(db);

      // 验证配置已重置为默认值
      const config = newConfigService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(1);
      expect(config.log.retentionDays).toBe(30);
      expect(config.websocket.port).toBe(3001);
    });

    it('应该支持重置单个配置项', () => {
      // 修改多个配置项
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      // 只重置速率限制配置
      configService.resetConfigKey('rateLimit');

      const config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(1); // 已重置
      expect(config.log.retentionDays).toBe(90); // 未重置
    });
  });

  describe('并发安全性', () => {
    it('应该支持多个ConfigService实例同时访问', () => {
      const service1 = new ConfigService(db);
      const service2 = new ConfigService(db);

      service1.updateConfig({
        rateLimit: { maxPerSecond: 2 },
      });

      // service2应该能读取到service1的更新
      service2.clearCache();
      const config = service2.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(2);
    });
  });
});
