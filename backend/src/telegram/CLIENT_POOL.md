# Telegram 客户端连接池

## 概述

`ClientPool` 是一个用于管理多个 Telegram 客户端实例的连接池实现。它提供了客户端的复用、健康检查、自动清理等功能，确保系统能够高效、稳定地管理多个 Telegram 账号。

## 核心特性

### 1. 连接池管理

- **单例模式**: 全局唯一的连接池实例
- **容量控制**: 可配置的最大客户端数量
- **自动清理**: 当连接池满时，自动移除最旧的空闲客户端
- **客户端复用**: 避免重复创建客户端实例

### 2. 会话恢复

- **自动恢复**: 当请求的客户端不在连接池中时，自动从数据库恢复会话
- **会话验证**: 验证会话的有效性和授权状态
- **透明处理**: 对调用者透明，无需关心客户端是否在池中

### 3. 健康监控

- **定期检查**: 每10分钟自动检查所有客户端的健康状态
- **连接状态**: 监控客户端的连接和授权状态
- **自动重连**: 提供重新连接不健康客户端的功能
- **统计信息**: 实时提供连接池的详细统计数据

### 4. 空闲管理

- **空闲超时**: 可配置的空闲超时时间（默认30分钟）
- **自动清理**: 每5分钟清理超时的空闲客户端
- **资源优化**: 释放长时间未使用的客户端资源

### 5. 统计和监控

- **实时统计**: 提供总数、活跃数、空闲数、健康数等统计信息
- **活跃追踪**: 追踪客户端的最后使用时间和使用次数
- **状态查询**: 支持查询指定时间范围内的活跃客户端

## API 文档

### 获取实例

```typescript
const pool = ClientPool.getInstance();
```

### 客户端管理

#### addClient(accountId: string, client: TelegramClientWrapper): void

添加客户端到连接池。

```typescript
const client = new TelegramClientWrapper('account-1', '+1234567890');
pool.addClient('account-1', client);
```

#### getClient(accountId: string): Promise<TelegramClientWrapper | undefined>

从连接池获取客户端。如果客户端不在池中，会尝试从数据库恢复会话。

```typescript
const client = await pool.getClient('account-1');
if (client) {
  // 使用客户端
}
```

#### removeClient(accountId: string): Promise<void>

从连接池移除客户端并断开连接。

```typescript
await pool.removeClient('account-1');
```

#### hasClient(accountId: string): boolean

检查客户端是否在连接池中。

```typescript
if (pool.hasClient('account-1')) {
  // 客户端存在
}
```

### 查询和统计

#### getAllClientIds(): string[]

获取所有客户端的 ID 列表。

```typescript
const ids = pool.getAllClientIds();
console.log(`连接池中有 ${ids.length} 个客户端`);
```

#### getActiveClientIds(withinMinutes: number = 30): string[]

获取指定时间范围内活跃的客户端 ID 列表。

```typescript
// 获取最近30分钟内活跃的客户端
const activeIds = pool.getActiveClientIds(30);
```

#### getPoolSize(): number

获取连接池当前大小。

```typescript
const size = pool.getPoolSize();
```

#### getPoolStats(): PoolStats

获取连接池的详细统计信息。

```typescript
const stats = pool.getPoolStats();
console.log(`总数: ${stats.totalClients}`);
console.log(`活跃: ${stats.activeClients}`);
console.log(`空闲: ${stats.idleClients}`);
console.log(`健康: ${stats.healthyClients}`);
console.log(`不健康: ${stats.unhealthyClients}`);
console.log(`最大容量: ${stats.maxClients}`);
```

### 配置管理

#### setMaxClients(max: number): void

设置连接池的最大客户端数量。

```typescript
pool.setMaxClients(20);
```

#### setIdleTimeout(timeoutMs: number): void

设置空闲超时时间（毫秒）。

```typescript
// 设置为30分钟
pool.setIdleTimeout(30 * 60 * 1000);
```

### 健康管理

#### reconnectUnhealthyClients(): Promise<void>

重新连接所有不健康的客户端。

```typescript
await pool.reconnectUnhealthyClients();
```

### 清理和销毁

#### clearPool(): Promise<void>

清空连接池，断开所有客户端连接。

```typescript
await pool.clearPool();
```

#### stopBackgroundTasks(): void

停止所有后台任务（清理任务和健康检查任务）。

```typescript
pool.stopBackgroundTasks();
```

#### destroy(): Promise<void>

销毁连接池，清空所有客户端并停止后台任务。

```typescript
await pool.destroy();
```

## 使用场景

### 场景1: 基本使用

```typescript
import { ClientPool, TelegramClientWrapper } from './telegram';

// 获取连接池
const pool = ClientPool.getInstance();

// 创建并添加客户端
const client = new TelegramClientWrapper('account-1', '+1234567890');
await client.connect();
pool.addClient('account-1', client);

// 使用客户端
const retrievedClient = await pool.getClient('account-1');
if (retrievedClient) {
  await retrievedClient.sendMessage('chat-id', '你好！');
}
```

### 场景2: 多账号管理

```typescript
// 添加多个账号
const accounts = [
  { id: 'account-1', phone: '+1234567890' },
  { id: 'account-2', phone: '+0987654321' },
  { id: 'account-3', phone: '+1122334455' },
];

for (const account of accounts) {
  const client = new TelegramClientWrapper(account.id, account.phone);
  await client.connect();
  pool.addClient(account.id, client);
}

// 轮流使用不同账号发送消息
for (const account of accounts) {
  const client = await pool.getClient(account.id);
  if (client) {
    await client.sendMessage('group-id', '消息内容');
  }
}
```

### 场景3: 自动会话恢复

```typescript
// 直接获取客户端，连接池会自动从数据库恢复会话
const client = await pool.getClient('existing-account-id');

if (client) {
  // 客户端已恢复，可以直接使用
  const isAuthorized = await client.isUserAuthorized();
  if (isAuthorized) {
    await client.sendMessage('chat-id', '消息');
  }
} else {
  console.log('无法恢复客户端会话');
}
```

### 场景4: 健康监控

```typescript
// 定期检查连接池健康状态
setInterval(
  async () => {
    const stats = pool.getPoolStats();

    console.log(`连接池状态: ${stats.healthyClients}/${stats.totalClients} 健康`);

    // 如果有不健康的客户端，尝试重连
    if (stats.unhealthyClients > 0) {
      console.log(`发现 ${stats.unhealthyClients} 个不健康的客户端，尝试重连...`);
      await pool.reconnectUnhealthyClients();
    }
  },
  10 * 60 * 1000
); // 每10分钟检查一次
```

### 场景5: 资源优化

```typescript
// 配置连接池以优化资源使用
pool.setMaxClients(10); // 最多10个客户端
pool.setIdleTimeout(20 * 60 * 1000); // 20分钟空闲超时

// 连接池会自动清理超时的空闲客户端
```

## 后台任务

连接池会自动启动两个后台任务：

### 1. 清理任务

- **频率**: 每5分钟执行一次
- **功能**: 清理超过空闲超时时间的客户端
- **目的**: 释放长时间未使用的资源

### 2. 健康检查任务

- **频率**: 每10分钟执行一次
- **功能**: 检查所有客户端的连接和授权状态
- **目的**: 及时发现和标记不健康的客户端

## 性能考虑

### 内存使用

- 每个客户端实例会占用一定的内存
- 建议根据系统资源设置合理的 `maxClients` 值
- 空闲超时机制可以帮助释放不常用的客户端

### 并发处理

- 连接池支持并发获取客户端
- 会话恢复过程是异步的，不会阻塞其他操作
- 健康检查和清理任务在后台独立运行

### 最佳实践

1. **合理设置容量**: 根据实际需要设置 `maxClients`，避免过大或过小
2. **监控健康状态**: 定期检查连接池统计信息，及时发现问题
3. **优雅关闭**: 应用退出前调用 `destroy()` 方法清理资源
4. **错误处理**: 始终检查 `getClient()` 的返回值，处理客户端不可用的情况
5. **会话管理**: 确保会话正确保存到数据库，以便后续恢复

## 错误处理

```typescript
try {
  const client = await pool.getClient('account-id');

  if (!client) {
    // 客户端不存在或无法恢复
    console.error('无法获取客户端');
    return;
  }

  // 使用客户端
  await client.sendMessage('chat-id', '消息');
} catch (error) {
  console.error('操作失败:', error);
}
```

## 注意事项

1. **单例模式**: `ClientPool` 是单例，整个应用只有一个实例
2. **异步操作**: 大部分操作是异步的，需要使用 `await`
3. **资源清理**: 应用退出前应该调用 `destroy()` 方法
4. **会话依赖**: 自动恢复功能依赖于 `SessionManager` 和数据库
5. **并发安全**: 连接池是并发安全的，可以在多个地方同时使用

## 相关文档

- [SessionManager 文档](./SESSION_MANAGEMENT.md)
- [TelegramClientWrapper 文档](./TelegramClientWrapper.ts)
- [设计文档](../../../.kiro/specs/telegram-channel-manager/design.md)
