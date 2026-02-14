import Database from 'better-sqlite3';
import { ConfigService, DEFAULT_CONFIG } from './ConfigService';

describe('ConfigService - 配置重置功能', () => {
  let db: Database.Database;
  let configService: ConfigService;

  beforeEach(() => {
    db = new Database(':memory:');
    configService = new ConfigService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('resetConfig - 重置所有配置', () => {
    it('应该将所有配置重置为默认值', () => {
      // 修改所有配置项
      configService.updateConfig({
        rateLimit: {
          maxPerSecond: 5,
          maxPerHour: 100,
          maxPerDay: 500,
          minDelayMs: 5000,
          maxDelayMs: 10000,
        },
        database: {
          path: '/custom/path/db.sqlite',
        },
        log: {
          retentionDays: 90,
        },
        websocket: {
          port: 5001,
        },
        api: {
          port: 5000,
        },
      });

      // 验证配置已修改
      let config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(5);
      expect(config.log.retentionDays).toBe(90);

      // 重置配置
      const resetConfig = configService.resetConfig();

      // 验证所有配置都已重置为默认值
      expect(resetConfig).toEqual(DEFAULT_CONFIG);
      expect(resetConfig.rateLimit.maxPerSecond).toBe(DEFAULT_CONFIG.rateLimit.maxPerSecond);
      expect(resetConfig.rateLimit.maxPerHour).toBe(DEFAULT_CONFIG.rateLimit.maxPerHour);
      expect(resetConfig.rateLimit.maxPerDay).toBe(DEFAULT_CONFIG.rateLimit.maxPerDay);
      expect(resetConfig.database.path).toBe(DEFAULT_CONFIG.database.path);
      expect(resetConfig.log.retentionDays).toBe(DEFAULT_CONFIG.log.retentionDays);
      expect(resetConfig.websocket.port).toBe(DEFAULT_CONFIG.websocket.port);
      expect(resetConfig.api.port).toBe(DEFAULT_CONFIG.api.port);
    });

    it('应该清除数据库中的所有配置记录', () => {
      // 修改配置
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      // 重置配置
      configService.resetConfig();

      // 创建新的ConfigService实例验证
      const newConfigService = new ConfigService(db);
      const config = newConfigService.getConfig();

      // 应该返回默认配置
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('应该清除缓存', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
      });

      const configBefore = configService.getConfig();
      expect(configBefore.rateLimit.maxPerSecond).toBe(5);

      configService.resetConfig();

      const configAfter = configService.getConfig();
      expect(configAfter.rateLimit.maxPerSecond).toBe(DEFAULT_CONFIG.rateLimit.maxPerSecond);
    });

    it('应该在未修改配置时也能正常工作', () => {
      // 不修改配置，直接重置
      const config = configService.resetConfig();

      // 应该返回默认配置
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('resetConfigKey - 重置特定配置项', () => {
    it('应该只重置速率限制配置', () => {
      // 修改多个配置项
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5, maxPerHour: 100 },
        log: { retentionDays: 90 },
        websocket: { port: 5001 },
      });

      // 只重置速率限制配置
      const config = configService.resetConfigKey('rateLimit');

      // 速率限制配置应该被重置
      expect(config.rateLimit).toEqual(DEFAULT_CONFIG.rateLimit);

      // 其他配置应该保持不变
      expect(config.log.retentionDays).toBe(90);
      expect(config.websocket.port).toBe(5001);
    });

    it('应该只重置日志配置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      const config = configService.resetConfigKey('log');

      expect(config.log).toEqual(DEFAULT_CONFIG.log);
      expect(config.rateLimit.maxPerSecond).toBe(5);
    });

    it('应该只重置数据库配置', () => {
      configService.updateConfig({
        database: { path: '/custom/path/db.sqlite' },
        log: { retentionDays: 90 },
      });

      const config = configService.resetConfigKey('database');

      expect(config.database).toEqual(DEFAULT_CONFIG.database);
      expect(config.log.retentionDays).toBe(90);
    });

    it('应该只重置WebSocket配置', () => {
      configService.updateConfig({
        websocket: { port: 5001 },
        api: { port: 5000 },
      });

      const config = configService.resetConfigKey('websocket');

      expect(config.websocket).toEqual(DEFAULT_CONFIG.websocket);
      expect(config.api.port).toBe(5000);
    });

    it('应该只重置API配置', () => {
      configService.updateConfig({
        api: { port: 5000 },
        websocket: { port: 5001 },
      });

      const config = configService.resetConfigKey('api');

      expect(config.api).toEqual(DEFAULT_CONFIG.api);
      expect(config.websocket.port).toBe(5001);
    });

    it('应该持久化重置后的配置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      configService.resetConfigKey('rateLimit');

      // 创建新的ConfigService实例验证
      const newConfigService = new ConfigService(db);
      const config = newConfigService.getConfig();

      expect(config.rateLimit).toEqual(DEFAULT_CONFIG.rateLimit);
      expect(config.log.retentionDays).toBe(90);
    });

    it('应该在配置项未修改时也能正常工作', () => {
      // 不修改配置，直接重置
      const config = configService.resetConfigKey('rateLimit');

      expect(config.rateLimit).toEqual(DEFAULT_CONFIG.rateLimit);
    });
  });

  describe('重置功能的边界情况', () => {
    it('应该支持连续多次重置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
      });

      configService.resetConfig();
      configService.resetConfig();
      configService.resetConfig();

      const config = configService.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('应该支持重置后再修改配置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
      });

      configService.resetConfig();

      configService.updateConfig({
        rateLimit: { maxPerSecond: 3 },
      });

      const config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(3);
    });

    it('应该支持部分重置后再全部重置', () => {
      configService.updateConfig({
        rateLimit: { maxPerSecond: 5 },
        log: { retentionDays: 90 },
      });

      configService.resetConfigKey('rateLimit');

      let config = configService.getConfig();
      expect(config.rateLimit.maxPerSecond).toBe(DEFAULT_CONFIG.rateLimit.maxPerSecond);
      expect(config.log.retentionDays).toBe(90);

      configService.resetConfig();

      config = configService.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });
});
