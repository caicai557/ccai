import Database from 'better-sqlite3';
import { ConfigService, DEFAULT_CONFIG, ConfigValidationError } from './ConfigService';

describe('ConfigService', () => {
  let db: Database.Database;
  let configService: ConfigService;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    configService = new ConfigService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getConfig', () => {
    it('应该返回默认配置', () => {
      const config = configService.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('应该缓存配置', () => {
      const config1 = configService.getConfig();
      const config2 = configService.getConfig();
      expect(config1).toBe(config2); // 应该是同一个对象引用
    });
  });

  describe('getRateLimitConfig', () => {
    it('应该返回速率限制配置', () => {
      const config = configService.getRateLimitConfig();
      expect(config).toEqual(DEFAULT_CONFIG.rateLimit);
    });
  });

  describe('getDatabaseConfig', () => {
    it('应该返回数据库配置', () => {
      const config = configService.getDatabaseConfig();
      expect(config).toEqual(DEFAULT_CONFIG.database);
    });
  });

  describe('getLogConfig', () => {
    it('应该返回日志配置', () => {
      const config = configService.getLogConfig();
      expect(config).toEqual(DEFAULT_CONFIG.log);
    });
  });

  describe('getWebSocketConfig', () => {
    it('应该返回WebSocket配置', () => {
      const config = configService.getWebSocketConfig();
      expect(config).toEqual(DEFAULT_CONFIG.websocket);
    });
  });

  describe('getApiConfig', () => {
    it('应该返回API配置', () => {
      const config = configService.getApiConfig();
      expect(config).toEqual(DEFAULT_CONFIG.api);
    });
  });

  describe('updateConfig', () => {
    it('应该更新速率限制配置', () => {
      const newConfig = configService.updateConfig({
        rateLimit: {
          maxPerSecond: 2,
          maxPerHour: 50,
          maxPerDay: 300,
          minDelayMs: 2000,
          maxDelayMs: 5000,
        },
      });

      expect(newConfig.rateLimit.maxPerSecond).toBe(2);
      expect(newConfig.rateLimit.maxPerHour).toBe(50);
      expect(newConfig.rateLimit.maxPerDay).toBe(300);
    });

    it('应该更新日志配置', () => {
      const newConfig = configService.updateConfig({
        log: {
          retentionDays: 60,
        },
      });

      expect(newConfig.log.retentionDays).toBe(60);
    });

    it('应该清除缓存', () => {
      configService.getConfig(); // 创建缓存
      configService.updateConfig({
        log: { retentionDays: 60 },
      });

      const config = configService.getConfig();
      expect(config.log.retentionDays).toBe(60);
    });

    it('应该持久化配置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 2 },
      });

      // 创建新的ConfigService实例
      const newConfigService = new ConfigService(db);
      const config = newConfigService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(2);
    });
  });

  describe('updateRateLimitConfig', () => {
    it('应该只更新速率限制配置', () => {
      const newConfig = configService.updateRateLimitConfig({
        maxPerSecond: 3,
      });

      expect(newConfig.rateLimit.maxPerSecond).toBe(3);
      expect(newConfig.rateLimit.maxPerHour).toBe(DEFAULT_CONFIG.rateLimit.maxPerHour);
    });
  });

  describe('updateLogConfig', () => {
    it('应该只更新日志配置', () => {
      const newConfig = configService.updateLogConfig({
        retentionDays: 90,
      });

      expect(newConfig.log.retentionDays).toBe(90);
    });
  });

  describe('updateWebSocketConfig', () => {
    it('应该只更新WebSocket配置', () => {
      const newConfig = configService.updateWebSocketConfig({
        port: 4001,
      });

      expect(newConfig.websocket.port).toBe(4001);
    });
  });

  describe('updateApiConfig', () => {
    it('应该只更新API配置', () => {
      const newConfig = configService.updateApiConfig({
        port: 4000,
      });

      expect(newConfig.api.port).toBe(4000);
    });
  });

  describe('resetConfig', () => {
    it('应该重置所有配置为默认值', () => {
      // 先修改配置
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      // 重置配置
      const config = configService.resetConfig();

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('应该清除数据库中的配置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
      });

      configService.resetConfig();

      // 创建新的ConfigService实例验证
      const newConfigService = new ConfigService(db);
      const config = newConfigService.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('resetConfigKey', () => {
    it('应该重置特定配置项', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      const config = configService.resetConfigKey('rateLimit');

      expect(config.rateLimit).toEqual(DEFAULT_CONFIG.rateLimit);
      expect(config.log.retentionDays).toBe(90); // 其他配置不变
    });
  });

  describe('配置验证', () => {
    describe('速率限制验证', () => {
      it('应该拒绝无效的maxPerSecond', () => {
        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerSecond: -1 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerSecond: 11 },
          });
        }).toThrow(ConfigValidationError);
      });

      it('应该拒绝无效的maxPerHour', () => {
        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerHour: -1 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerHour: 101 },
          });
        }).toThrow(ConfigValidationError);
      });

      it('应该拒绝无效的maxPerDay', () => {
        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerDay: -1 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxPerDay: 1001 },
          });
        }).toThrow(ConfigValidationError);
      });

      it('应该拒绝无效的延迟配置', () => {
        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, minDelayMs: -1 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            rateLimit: { ...DEFAULT_CONFIG.rateLimit, maxDelayMs: 40000 },
          });
        }).toThrow(ConfigValidationError);
      });

      it('应该拒绝minDelayMs大于maxDelayMs', () => {
        expect(() => {
          configService.updateConfig({
            rateLimit: {
              ...DEFAULT_CONFIG.rateLimit,
              minDelayMs: 5000,
              maxDelayMs: 3000,
            },
          });
        }).toThrow(ConfigValidationError);
      });
    });

    describe('日志配置验证', () => {
      it('应该拒绝无效的retentionDays', () => {
        expect(() => {
          configService.updateConfig({
            log: { retentionDays: 0 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            log: { retentionDays: 366 },
          });
        }).toThrow(ConfigValidationError);
      });
    });

    describe('端口配置验证', () => {
      it('应该拒绝无效的WebSocket端口', () => {
        expect(() => {
          configService.updateConfig({
            websocket: { port: 1023 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            websocket: { port: 65536 },
          });
        }).toThrow(ConfigValidationError);
      });

      it('应该拒绝无效的API端口', () => {
        expect(() => {
          configService.updateConfig({
            api: { port: 1023 },
          });
        }).toThrow(ConfigValidationError);

        expect(() => {
          configService.updateConfig({
            api: { port: 65536 },
          });
        }).toThrow(ConfigValidationError);
      });
    });

    describe('数据库配置验证', () => {
      it('应该拒绝空的数据库路径', () => {
        expect(() => {
          configService.updateConfig({
            database: { path: '' },
          });
        }).toThrow(ConfigValidationError);
      });
    });
  });

  describe('clearCache', () => {
    it('应该清除缓存', () => {
      const config1 = configService.getConfig();
      configService.clearCache();
      const config2 = configService.getConfig();

      expect(config1).not.toBe(config2); // 应该是不同的对象引用
      expect(config1).toEqual(config2); // 但内容相同
    });
  });
});
