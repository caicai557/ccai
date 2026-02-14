# ConfigService 使用指南

## 概述

ConfigService 提供了系统配置的管理功能，包括配置的读取、更新、验证和重置。所有配置都会持久化到数据库中，并在系统重启后自动恢复。

## 功能特性

- ✅ 配置读取和缓存
- ✅ 配置更新和验证
- ✅ 配置持久化
- ✅ 配置重置（全部或单个）
- ✅ 类型安全的配置接口
- ✅ 默认配置值

## 配置项

### 速率限制配置 (rateLimit)

控制消息发送的速率限制：

- `maxPerSecond`: 每秒最大消息数（0-10，默认1）
- `maxPerHour`: 每小时最大消息数（0-100，默认30）
- `maxPerDay`: 每天最大消息数（0-1000，默认200）
- `minDelayMs`: 最小延迟毫秒数（0-10000，默认1000）
- `maxDelayMs`: 最大延迟毫秒数（0-30000，默认3000）

### 数据库配置 (database)

- `path`: 数据库文件路径（默认 './data/database.sqlite'）

### 日志配置 (log)

- `retentionDays`: 日志保留天数（1-365，默认30）

### WebSocket配置 (websocket)

- `port`: WebSocket服务器端口（1024-65535，默认3001）

### API配置 (api)

- `port`: API服务器端口（1024-65535，默认3000）

## 使用示例

### 初始化

```typescript
import Database from 'better-sqlite3';
import { ConfigService } from './services/config/ConfigService';

const db = new Database('./data/database.sqlite');
const configService = new ConfigService(db);
```

### 读取配置

```typescript
// 获取完整配置
const config = configService.getConfig();
console.log(config);

// 获取特定配置项
const rateLimitConfig = configService.getRateLimitConfig();
const logConfig = configService.getLogConfig();
const wsConfig = configService.getWebSocketConfig();
const apiConfig = configService.getApiConfig();
const dbConfig = configService.getDatabaseConfig();
```

### 更新配置

```typescript
// 更新完整配置
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
});

// 只更新速率限制配置
configService.updateRateLimitConfig({
  maxPerSecond: 3,
});

// 只更新日志配置
configService.updateLogConfig({
  retentionDays: 90,
});

// 只更新WebSocket配置
configService.updateWebSocketConfig({
  port: 4001,
});

// 只更新API配置
configService.updateApiConfig({
  port: 4000,
});
```

### 配置验证

配置更新时会自动进行验证，如果验证失败会抛出 `ConfigValidationError`：

```typescript
import { ConfigValidationError } from './services/config/ConfigService';

try {
  configService.updateConfig({
    rateLimit: { maxPerSecond: -1 }, // 无效值
  });
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('配置验证失败:', error.message);
  }
}
```

### 重置配置

```typescript
// 重置所有配置为默认值
configService.resetConfig();

// 只重置速率限制配置
configService.resetConfigKey('rateLimit');

// 只重置日志配置
configService.resetConfigKey('log');
```

### 清除缓存

```typescript
// 清除配置缓存（下次读取时会从数据库重新加载）
configService.clearCache();
```

## 配置持久化

所有配置更改都会自动持久化到数据库中。系统重启后，配置会自动从数据库恢复：

```typescript
// 第一次运行
configService.updateConfig({
  rateLimit: { maxPerSecond: 5 },
});

// 系统重启后
const db = new Database('./data/database.sqlite');
const newConfigService = new ConfigService(db);
const config = newConfigService.getConfig();
console.log(config.rateLimit.maxPerSecond); // 输出: 5
```

## 默认配置

如果数据库中没有配置记录，系统会使用以下默认配置：

```typescript
{
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
}
```

## 错误处理

### ConfigValidationError

当配置验证失败时抛出：

```typescript
try {
  configService.updateConfig({
    rateLimit: { maxPerSecond: 100 }, // 超出范围
  });
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('验证错误:', error.message);
    // 输出: 验证错误: 每秒最大消息数必须在0-10之间
  }
}
```

## 最佳实践

1. **使用单例模式**: 在应用中只创建一个 ConfigService 实例
2. **缓存配置**: ConfigService 会自动缓存配置，避免频繁读取数据库
3. **验证配置**: 在更新配置前，ConfigService 会自动验证配置的有效性
4. **持久化配置**: 所有配置更改都会自动持久化，无需手动保存
5. **错误处理**: 始终捕获 ConfigValidationError 并提供友好的错误提示

## 测试

ConfigService 包含完整的单元测试和集成测试：

```bash
# 运行所有ConfigService测试
npm test -- ConfigService

# 运行单元测试
npm test -- ConfigService.test.ts

# 运行集成测试
npm test -- ConfigService.integration.test.ts

# 运行重置功能测试
npm test -- ConfigService.reset.test.ts
```

## 相关文件

- `ConfigService.ts` - 配置服务实现
- `ConfigDao.ts` - 配置数据访问对象
- `ConfigService.test.ts` - 单元测试
- `ConfigService.integration.test.ts` - 集成测试
- `ConfigService.reset.test.ts` - 重置功能测试
