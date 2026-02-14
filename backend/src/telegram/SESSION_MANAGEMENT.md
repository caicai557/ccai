# Telegram 会话管理实现文档

## 概述

本文档描述了 Telegram 频道/群组管理系统中的会话管理实现，包括会话持久化、恢复、验证和安全存储。

## 核心组件

### 1. SessionManager（会话管理器）

`SessionManager` 是一个单例类，负责管理所有 Telegram 账号的会话。

#### 主要功能

- **会话持久化**：将 StringSession 加密后存储到数据库
- **会话恢复**：从数据库加载并解密会话
- **会话验证**：检查会话是否有效
- **会话清理**：清理过期的会话
- **会话导入/导出**：支持会话备份和恢复

#### 使用示例

```typescript
import { SessionManager } from './telegram/SessionManager';

const sessionManager = SessionManager.getInstance();

// 保存会话
await sessionManager.saveSession(accountId, sessionString);

// 加载会话
const sessionString = await sessionManager.loadSession(accountId);

// 验证会话
const isValid = await sessionManager.isSessionValid(accountId);

// 删除会话
await sessionManager.deleteSession(accountId);

// 清理过期会话（30天未使用）
const cleanedCount = await sessionManager.cleanupExpiredSessions(30);
```

### 2. TelegramClientWrapper（客户端包装类）

增强的 Telegram 客户端包装类，集成了会话管理功能。

#### 新增功能

- **自动会话保存**：登录成功后自动保存会话
- **会话验证**：验证会话是否有效
- **自动重连**：连接断开时自动重连（最多3次）
- **事件监听**：监听连接状态变化

#### 使用示例

```typescript
import { TelegramClientWrapper } from './telegram/TelegramClientWrapper';

// 创建客户端（使用已保存的会话）
const client = new TelegramClientWrapper(accountId, phoneNumber, sessionString);

// 连接
await client.connect();

// 保存会话
await client.saveSession();

// 验证会话
const isValid = await client.validateSession();
```

### 3. AccountService（账号服务）

集成了会话管理器的账号服务。

#### 会话相关方法

```typescript
import { AccountService } from './services/AccountService';

const accountService = new AccountService();

// 获取客户端（自动从会话恢复）
const client = await accountService.getClient(accountId);

// 检查账号状态（包含会话验证）
const status = await accountService.checkAccountStatus(accountId);

// 清理过期会话
const cleanedCount = await accountService.cleanupExpiredSessions(30);

// 导出会话（用于备份）
const encryptedSession = await accountService.exportSession(accountId);

// 导入会话（用于恢复）
await accountService.importSession(accountId, encryptedSession);
```

## 安全机制

### 1. 会话加密

所有会话字符串在存储到数据库前都会使用 AES-256-CBC 加密：

```typescript
import { encrypt, decrypt } from './utils/crypto';

// 加密
const encryptedSession = encrypt(sessionString);

// 解密
const sessionString = decrypt(encryptedSession);
```

### 2. 加密密钥管理

加密密钥通过环境变量配置：

```bash
# .env 文件
ENCRYPTION_KEY=your_random_encryption_key_here
```

**重要提示**：

- 加密密钥应该是随机生成的 32 字节字符串
- 不要将加密密钥提交到版本控制系统
- 定期更换加密密钥（需要重新加密所有会话）

### 3. 会话验证

系统会在以下情况下验证会话：

1. 从数据库恢复会话时
2. 检查账号状态时
3. 获取客户端实例时

验证失败会抛出错误，要求用户重新登录。

## 会话生命周期

### 1. 会话创建

```
用户输入手机号
    ↓
发送验证码
    ↓
用户输入验证码
    ↓
（可选）输入两步验证密码
    ↓
登录成功，获取 StringSession
    ↓
加密并保存到数据库
```

### 2. 会话使用

```
需要使用 Telegram 客户端
    ↓
检查连接池中是否有客户端
    ↓
如果没有，从数据库加载会话
    ↓
解密会话字符串
    ↓
创建 TelegramClient 实例
    ↓
连接并验证会话
    ↓
添加到连接池
```

### 3. 会话过期

```
定期检查会话最后使用时间
    ↓
如果超过 N 天未使用
    ↓
标记为过期
    ↓
清理会话数据
```

## 自动重连机制

当 Telegram 连接断开时，系统会自动尝试重连：

1. 检测到连接断开
2. 等待 2 秒 × 重试次数
3. 尝试重新连接
4. 最多重试 3 次
5. 如果失败，记录错误并停止重连

## 最佳实践

### 1. 会话管理

- ✅ 始终使用 `SessionManager` 来管理会话
- ✅ 登录成功后立即保存会话
- ✅ 定期清理过期会话
- ✅ 在生产环境中使用强加密密钥
- ❌ 不要在日志中输出会话字符串
- ❌ 不要在前端存储未加密的会话

### 2. 错误处理

```typescript
try {
  const client = await accountService.getClient(accountId);
  // 使用客户端
} catch (error) {
  if (error.message.includes('会话已失效')) {
    // 提示用户重新登录
    console.log('会话已过期，请重新登录');
  } else {
    // 其他错误处理
    console.error('获取客户端失败:', error);
  }
}
```

### 3. 性能优化

- 使用连接池避免重复创建客户端
- 批量清理过期会话而不是逐个清理
- 缓存会话验证结果（短时间内）

## 故障排查

### 问题1: 会话加载失败

**症状**：`加载会话失败: 无效的加密文本格式`

**原因**：

- 加密密钥已更改
- 数据库中的会话数据损坏

**解决方案**：

1. 检查 `ENCRYPTION_KEY` 环境变量
2. 删除损坏的会话，要求用户重新登录

### 问题2: 会话验证失败

**症状**：`账号会话已失效，请重新登录`

**原因**：

- Telegram 服务器端会话已过期
- 账号被封禁或限制

**解决方案**：

1. 要求用户重新登录
2. 检查账号状态

### 问题3: 自动重连失败

**症状**：客户端频繁断开连接

**原因**：

- 网络不稳定
- Telegram 服务器问题
- 账号被限制

**解决方案**：

1. 检查网络连接
2. 查看 Telegram 官方状态
3. 检查账号是否被限制

## 测试

运行会话管理器测试：

```bash
# 运行测试
tsx backend/src/telegram/SessionManager.test.ts
```

测试覆盖：

- ✅ 会话保存
- ✅ 会话加载
- ✅ 会话验证
- ✅ 会话删除
- ✅ 会话导入/导出
- ✅ 活跃会话列表

## 未来改进

1. **会话轮转**：定期自动更新会话
2. **多设备支持**：支持同一账号在多个设备上使用
3. **会话监控**：实时监控会话状态
4. **会话备份**：自动备份会话到安全位置
5. **会话恢复**：从备份恢复会话

## 相关文档

- [Telegram Client API](https://core.telegram.org/api)
- [GramJS 文档](https://gram.js.org/)
- [StringSession 说明](https://gram.js.org/sessions)

## 更新日志

### v1.0.0 (2024-02-13)

- ✅ 实现 SessionManager 类
- ✅ 集成会话加密存储
- ✅ 实现自动重连机制
- ✅ 添加会话验证功能
- ✅ 实现会话导入/导出
- ✅ 添加过期会话清理
