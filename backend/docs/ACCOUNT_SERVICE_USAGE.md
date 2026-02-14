# AccountService 使用说明

## 账号添加流程（任务 2.2.1）

### 功能概述

`AccountService.addAccount()` 方法实现了Telegram账号添加的第一步：发送验证码。

### 实现细节

#### 1. 方法签名

```typescript
async addAccount(phoneNumber: string): Promise<{ accountId: string; phoneCodeHash: string }>
```

#### 2. 功能流程

1. **验证手机号唯一性**
   - 检查数据库中是否已存在该手机号
   - 如果存在，抛出错误：`该手机号已添加`

2. **创建临时账号记录**
   - 在数据库中创建一个临时账号记录
   - 初始状态为 `offline`
   - session 字段为空字符串

3. **初始化Telegram客户端**
   - 创建 `TelegramClientWrapper` 实例
   - 使用账号ID和手机号初始化

4. **发送验证码**
   - 调用 Telegram API 发送验证码到用户手机
   - 返回 `phoneCodeHash`（用于后续验证）

5. **保存客户端**
   - 将客户端实例添加到连接池
   - 用于后续的验证码验证步骤

6. **错误处理**
   - 如果任何步骤失败，自动删除临时账号记录
   - 确保数据库不会留下无效数据

#### 3. 返回值

```typescript
{
  accountId: string; // 账号唯一ID，用于后续验证步骤
  phoneCodeHash: string; // 验证码哈希，用于验证验证码
}
```

### 使用示例

```typescript
import { AccountService } from './services/AccountService';

const accountService = new AccountService();

try {
  // 步骤1：发送验证码
  const result = await accountService.addAccount('+8613800138000');

  console.log('账号ID:', result.accountId);
  console.log('验证码哈希:', result.phoneCodeHash);

  // 步骤2：用户输入验证码后，调用 verifyCode
  // await accountService.verifyCode(result.accountId, '12345', result.phoneCodeHash);
} catch (error) {
  console.error('添加账号失败:', error.message);
}
```

### 错误处理

#### 常见错误

1. **手机号已存在**

   ```
   错误: 该手机号已添加
   原因: 数据库中已有该手机号的记录
   解决: 使用不同的手机号或删除现有账号
   ```

2. **Telegram API配置缺失**

   ```
   错误: Telegram API配置缺失，请在.env文件中配置TELEGRAM_API_ID和TELEGRAM_API_HASH
   原因: 环境变量未配置
   解决: 在 .env 文件中添加 TELEGRAM_API_ID 和 TELEGRAM_API_HASH
   ```

3. **网络连接失败**

   ```
   错误: 连接Telegram服务器失败
   原因: 网络问题或Telegram服务不可用
   解决: 检查网络连接，稍后重试
   ```

4. **手机号格式错误**
   ```
   错误: PHONE_NUMBER_INVALID
   原因: 手机号格式不正确
   解决: 使用国际格式，如 +8613800138000
   ```

### 后续步骤

完成 `addAccount` 后，需要继续以下步骤：

1. **验证验证码** (任务 2.2.2)

   ```typescript
   await accountService.verifyCode(accountId, code, phoneCodeHash);
   ```

2. **如需两步验证** (任务 2.2.3)
   ```typescript
   await accountService.verifyPassword(accountId, password);
   ```

### 数据库变化

调用 `addAccount` 后，数据库 `accounts` 表会新增一条记录：

```sql
INSERT INTO accounts (
  id, phone_number, session, username, first_name, last_name,
  status, last_active, created_at, updated_at
) VALUES (
  'generated-uuid',
  '+8613800138000',
  '',
  NULL,
  NULL,
  NULL,
  'offline',
  NULL,
  '2024-01-01T00:00:00.000Z',
  '2024-01-01T00:00:00.000Z'
);
```

### 依赖组件

- `AccountDao`: 数据库操作
- `TelegramClientWrapper`: Telegram客户端封装
- `ClientPool`: 客户端连接池管理
- `SessionManager`: 会话管理
- `logger`: 日志记录

### 配置要求

在使用前，需要在 `.env` 文件中配置：

```env
# Telegram API 配置
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# 数据库配置
DATABASE_PATH=./data/telegram-manager.db

# 加密密钥
ENCRYPTION_KEY=your_encryption_key
```

### 测试

由于需要真实的Telegram API凭证和网络连接，建议：

1. **单元测试**: 测试错误处理逻辑（如重复手机号检查）
2. **集成测试**: 使用真实凭证测试完整流程
3. **手动测试**: 在开发环境中使用真实手机号测试

### 性能考虑

- 发送验证码通常需要 2-5 秒
- Telegram API 有速率限制，避免频繁调用
- 建议添加防抖机制，避免用户重复点击

### 安全考虑

1. **手机号验证**: 建议在前端添加手机号格式验证
2. **速率限制**: 建议添加 IP 级别的速率限制
3. **日志记录**: 敏感信息（如验证码）不应记录到日志
4. **会话安全**: session 数据使用 AES-256 加密存储

## 相关文档

- [TelegramClientWrapper 文档](../src/telegram/TelegramClientWrapper.ts)
- [ClientPool 文档](../src/telegram/CLIENT_POOL.md)
- [SessionManager 文档](../src/telegram/SESSION_MANAGEMENT.md)
- [数据库设计](../src/database/schema.ts)
