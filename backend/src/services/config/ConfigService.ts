import { ConfigDao } from '../../database/dao/ConfigDao';
import Database from 'better-sqlite3';

/**
 * 系统配置接口
 */
export interface SystemConfig {
  // 速率限制配置
  rateLimit: {
    maxPerSecond: number;
    maxPerHour: number;
    maxPerDay: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  // 数据库配置
  database: {
    path: string;
  };
  // 日志配置
  log: {
    retentionDays: number;
  };
  // WebSocket配置
  websocket: {
    port: number;
  };
  // API服务器配置
  api: {
    port: number;
  };
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: SystemConfig = {
  rateLimit: {
    maxPerSecond: 1,
    maxPerHour: 30,
    maxPerDay: 200,
    minDelayMs: 1000,
    maxDelayMs: 3000,
  },
  database: {
    path: './data/database.sqlite',
  },
  log: {
    retentionDays: 30,
  },
  websocket: {
    port: 3001,
  },
  api: {
    port: 3000,
  },
};

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 配置服务
 */
export class ConfigService {
  private configDao: ConfigDao;
  private cache: SystemConfig | null = null;

  constructor(db: Database.Database) {
    this.configDao = new ConfigDao(db);
  }

  /**
   * 获取完整配置
   */
  getConfig(): SystemConfig {
    if (this.cache) {
      return this.cache;
    }

    const storedConfig = this.configDao.getAllAsObject();
    const config = this.mergeWithDefaults(storedConfig);
    this.cache = config;
    return config;
  }

  /**
   * 获取速率限制配置
   */
  getRateLimitConfig(): SystemConfig['rateLimit'] {
    return this.getConfig().rateLimit;
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig(): SystemConfig['database'] {
    return this.getConfig().database;
  }

  /**
   * 获取日志配置
   */
  getLogConfig(): SystemConfig['log'] {
    return this.getConfig().log;
  }

  /**
   * 获取WebSocket配置
   */
  getWebSocketConfig(): SystemConfig['websocket'] {
    return this.getConfig().websocket;
  }

  /**
   * 获取API配置
   */
  getApiConfig(): SystemConfig['api'] {
    return this.getConfig().api;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SystemConfig>): SystemConfig {
    // 验证配置
    this.validateConfig(config);

    // 扁平化配置并保存
    const flatConfig = this.flattenConfig(config);
    this.configDao.setMany(flatConfig);

    // 清除缓存
    this.cache = null;

    return this.getConfig();
  }

  /**
   * 更新速率限制配置
   */
  updateRateLimitConfig(config: Partial<SystemConfig['rateLimit']>): SystemConfig {
    const currentConfig = this.getConfig();
    return this.updateConfig({
      rateLimit: {
        ...currentConfig.rateLimit,
        ...config,
      },
    });
  }

  /**
   * 更新日志配置
   */
  updateLogConfig(config: Partial<SystemConfig['log']>): SystemConfig {
    const currentConfig = this.getConfig();
    return this.updateConfig({
      log: {
        ...currentConfig.log,
        ...config,
      },
    });
  }

  /**
   * 更新WebSocket配置
   */
  updateWebSocketConfig(config: Partial<SystemConfig['websocket']>): SystemConfig {
    const currentConfig = this.getConfig();
    return this.updateConfig({
      websocket: {
        ...currentConfig.websocket,
        ...config,
      },
    });
  }

  /**
   * 更新API配置
   */
  updateApiConfig(config: Partial<SystemConfig['api']>): SystemConfig {
    const currentConfig = this.getConfig();
    return this.updateConfig({
      api: {
        ...currentConfig.api,
        ...config,
      },
    });
  }

  /**
   * 重置配置为默认值
   */
  resetConfig(): SystemConfig {
    this.configDao.clear();
    this.cache = null;
    return this.getConfig();
  }

  /**
   * 重置特定配置项为默认值
   */
  resetConfigKey(key: keyof SystemConfig): SystemConfig {
    const defaultValue = DEFAULT_CONFIG[key];
    return this.updateConfig({ [key]: defaultValue } as Partial<SystemConfig>);
  }

  /**
   * 验证配置
   */
  private validateConfig(config: Partial<SystemConfig>): void {
    // 验证速率限制配置
    if (config.rateLimit) {
      const { maxPerSecond, maxPerHour, maxPerDay, minDelayMs, maxDelayMs } = config.rateLimit;

      if (maxPerSecond !== undefined && (maxPerSecond < 0 || maxPerSecond > 10)) {
        throw new ConfigValidationError('每秒最大消息数必须在0-10之间');
      }

      if (maxPerHour !== undefined && (maxPerHour < 0 || maxPerHour > 100)) {
        throw new ConfigValidationError('每小时最大消息数必须在0-100之间');
      }

      if (maxPerDay !== undefined && (maxPerDay < 0 || maxPerDay > 1000)) {
        throw new ConfigValidationError('每天最大消息数必须在0-1000之间');
      }

      if (minDelayMs !== undefined && (minDelayMs < 0 || minDelayMs > 10000)) {
        throw new ConfigValidationError('最小延迟必须在0-10000毫秒之间');
      }

      if (maxDelayMs !== undefined && (maxDelayMs < 0 || maxDelayMs > 30000)) {
        throw new ConfigValidationError('最大延迟必须在0-30000毫秒之间');
      }

      if (minDelayMs !== undefined && maxDelayMs !== undefined && minDelayMs > maxDelayMs) {
        throw new ConfigValidationError('最小延迟不能大于最大延迟');
      }
    }

    // 验证日志配置
    if (config.log) {
      const { retentionDays } = config.log;

      if (retentionDays !== undefined && (retentionDays < 1 || retentionDays > 365)) {
        throw new ConfigValidationError('日志保留天数必须在1-365之间');
      }
    }

    // 验证WebSocket配置
    if (config.websocket) {
      const { port } = config.websocket;

      if (port !== undefined && (port < 1024 || port > 65535)) {
        throw new ConfigValidationError('WebSocket端口必须在1024-65535之间');
      }
    }

    // 验证API配置
    if (config.api) {
      const { port } = config.api;

      if (port !== undefined && (port < 1024 || port > 65535)) {
        throw new ConfigValidationError('API端口必须在1024-65535之间');
      }
    }

    // 验证数据库配置
    if (config.database) {
      const { path } = config.database;

      if (path !== undefined && !path) {
        throw new ConfigValidationError('数据库路径不能为空');
      }
    }
  }

  /**
   * 将嵌套配置扁平化为键值对
   */
  private flattenConfig(config: Partial<SystemConfig>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [section, values] of Object.entries(config)) {
      if (typeof values === 'object' && values !== null) {
        for (const [key, value] of Object.entries(values)) {
          result[`${section}.${key}`] = String(value);
        }
      }
    }

    return result;
  }

  /**
   * 将存储的配置与默认配置合并
   */
  private mergeWithDefaults(storedConfig: Record<string, string>): SystemConfig {
    const config: SystemConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    for (const [key, value] of Object.entries(storedConfig)) {
      const parts = key.split('.');
      if (parts.length === 2) {
        const section = parts[0];
        const field = parts[1];
        if (section && field && section in config && field in (config as any)[section]) {
          // 尝试转换为数字
          const numValue = Number(value);
          (config as any)[section][field] = isNaN(numValue) ? value : numValue;
        }
      }
    }

    return config;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = null;
  }
}
