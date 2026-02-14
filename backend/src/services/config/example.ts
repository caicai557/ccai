/**
 * ConfigService 使用示例
 *
 * 这个文件展示了如何使用ConfigService管理系统配置
 */

import Database from 'better-sqlite3';
import { ConfigService, ConfigValidationError } from './ConfigService';

// 初始化数据库和ConfigService
const db = new Database(':memory:'); // 使用内存数据库作为示例
const configService = new ConfigService(db);

console.log('=== ConfigService 使用示例 ===\n');

// 1. 读取默认配置
console.log('1. 读取默认配置:');
const defaultConfig = configService.getConfig();
console.log('速率限制配置:', defaultConfig.rateLimit);
console.log('日志配置:', defaultConfig.log);
console.log();

// 2. 更新配置
console.log('2. 更新速率限制配置:');
configService.updateRateLimitConfig({
  maxPerSecond: 2,
  maxPerHour: 50,
});
console.log('更新后的速率限制:', configService.getRateLimitConfig());
console.log();

// 3. 更新多个配置项
console.log('3. 更新多个配置项:');
configService.updateConfig({
  log: { retentionDays: 60 },
  websocket: { port: 4001 },
});
console.log('日志配置:', configService.getLogConfig());
console.log('WebSocket配置:', configService.getWebSocketConfig());
console.log();

// 4. 配置验证
console.log('4. 配置验证示例:');
try {
  configService.updateConfig({
    rateLimit: {
      maxPerSecond: -1, // 无效值
      maxPerHour: 50,
      maxPerDay: 200,
      minDelayMs: 1000,
      maxDelayMs: 3000,
    },
  });
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.log('✓ 验证成功拦截无效配置:', error.message);
  }
}
console.log();

// 5. 配置持久化
console.log('5. 配置持久化验证:');
const configBeforeReset = configService.getConfig();
console.log('当前配置:', {
  maxPerSecond: configBeforeReset.rateLimit.maxPerSecond,
  retentionDays: configBeforeReset.log.retentionDays,
});

// 创建新的ConfigService实例（模拟系统重启）
const newConfigService = new ConfigService(db);
const restoredConfig = newConfigService.getConfig();
console.log('重启后恢复的配置:', {
  maxPerSecond: restoredConfig.rateLimit.maxPerSecond,
  retentionDays: restoredConfig.log.retentionDays,
});
console.log();

// 6. 重置配置
console.log('6. 重置配置:');
console.log('重置前 - maxPerSecond:', configService.getRateLimitConfig().maxPerSecond);
configService.resetConfigKey('rateLimit');
console.log('重置后 - maxPerSecond:', configService.getRateLimitConfig().maxPerSecond);
console.log();

// 7. 完全重置
console.log('7. 完全重置所有配置:');
configService.resetConfig();
const finalConfig = configService.getConfig();
console.log('重置后的配置:', {
  maxPerSecond: finalConfig.rateLimit.maxPerSecond,
  retentionDays: finalConfig.log.retentionDays,
  wsPort: finalConfig.websocket.port,
});
console.log();

// 8. 获取特定配置项
console.log('8. 获取特定配置项:');
console.log('速率限制配置:', configService.getRateLimitConfig());
console.log('数据库配置:', configService.getDatabaseConfig());
console.log('日志配置:', configService.getLogConfig());
console.log('WebSocket配置:', configService.getWebSocketConfig());
console.log('API配置:', configService.getApiConfig());
console.log();

// 清理
db.close();

console.log('=== 示例完成 ===');
