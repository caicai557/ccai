# Telegram 客户端自动重连机制

## 概述

本文档描述了 `TelegramClientWrapper` 类中实现的自动重连机制，用于处理网络断连和自动恢复。

## 功能特性

### 1. 指数退避重连策略

- 基础延迟：2000ms（2秒）
- 最大延迟：60000ms（60秒）
- 重连延迟计算公式：`baseDelay * 2^attempts`
- 添加随机抖动（±20%）避免多个客户端同时重连

### 2. 连接状态监控

- 实时监听 Telegram 连接状态变化
- 自动检测连接断开事件
- 记录连接失败次数和最后成功连接时间

### 3. 心跳检测机制

- 默认心跳间隔：60秒
- 使用 `getMe()` API 调用验证连接有效性
- 心跳失败时自动触发重连

### 4. 重连限制

- 默认最大重连次数：5次
- 超过最大次数后停止自动重连
- 支持手动触发重连（重置计数器）

### 5. 可配置性

通过 `setReconnectConfig()` 方法可以配置：

```typescript
interface ReconnectConfig {
  maxAttempts: number; // 最大重连次数
  baseDelay: number; // 基础延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  enableHeartbeat: boolean; // 是否启用心跳检测
  heartbeatInterval: number; // 心跳间隔（毫秒）
}
```

## 使用示例

### 基本使用

```typescript
const wrapper = new TelegramClientWrapper(accountId, phoneNumber, session);

// 连接会自动处理重连
await wrapper.connect();
```

### 自定义重连配置

```typescript
wrapper.setReconnectConfig({
  maxAttempts: 10, // 增加到10次
  baseDelay: 1000, // 减少基础延迟到1秒
  maxDelay: 30000, // 减少最大延迟到30秒
  enableHeartbeat: true, // 启用心跳
  heartbeatInterval: 30000, // 30秒心跳间隔
});
```

### 手动触发重连

```typescript
// 重置重连计数并立即重连
await wrapper.manualReconnect();
```

### 获取重连状态

```typescript
const status = wrapper.getReconnectStatus();
console.log('是否正在重连:', status.isReconnecting);
console.log('重连尝试次数:', status.reconnectAttempts);
console.log('最大重连次数:', status.maxAttempts);
console.log('连接失败次数:', status.connectionFailures);
console.log('最后成功连接时间:', status.lastSuccessfulConnection);
```

## 重连流程

```
连接断开
    ↓
检查是否已在重连中 → 是 → 跳过
    ↓ 否
检查重连次数 → 超过限制 → 停止重连
    ↓ 未超过
计算延迟时间（指数退避 + 随机抖动）
    ↓
等待延迟时间
    ↓
尝试重新连接
    ↓
成功 → 重置计数器，启动心跳
    ↓ 失败
增加重连次数 → 返回"检查重连次数"
```

## 连接状态处理

### 状态码说明

- `-1`: 连接断开 → 触发重连
- `0`: 正在连接 → 等待
- `1`: 已连接 → 重置计数器，启动心跳

### 断开连接时的清理

```typescript
await wrapper.disconnect();
// 自动执行：
// 1. 停止心跳定时器
// 2. 清除重连定时器
// 3. 断开 Telegram 连接
```

## 错误处理

### 连接错误

- 记录错误日志
- 增加失败计数
- 触发重连调度

### 心跳失败

- 标记连接为断开状态
- 触发重连流程

## 测试

测试文件位于：`backend/src/telegram/TelegramClientWrapper.test.ts`

运行测试：

```bash
cd backend
pnpm test -- TelegramClientWrapper
```

### 测试覆盖

- ✅ 默认重连配置验证
- ✅ 重连配置更新
- ✅ 重连状态查询
- ✅ 客户端信息获取
- ✅ 指数退避算法验证
- ✅ 最大延迟限制验证

## 注意事项

1. **网络环境**：在不稳定的网络环境下，建议增加最大重连次数
2. **心跳间隔**：心跳间隔不宜过短，避免频繁的 API 调用
3. **资源清理**：使用完毕后务必调用 `disconnect()` 清理资源
4. **并发控制**：多个客户端实例应通过 `ClientPool` 统一管理

## 相关文件

- `TelegramClientWrapper.ts` - 主实现文件
- `ClientPool.ts` - 客户端连接池（包含健康检查和自动重连）
- `SessionManager.ts` - 会话管理
- `AUTO_RECONNECT.md` - 本文档

## 未来改进

- [ ] 支持自定义重连策略（线性、指数、固定间隔等）
- [ ] 添加重连事件回调
- [ ] 支持网络状态检测（在线/离线）
- [ ] 添加更详细的重连统计信息
- [ ] 支持优雅降级（降低心跳频率等）
