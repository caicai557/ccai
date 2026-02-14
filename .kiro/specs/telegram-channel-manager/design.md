# Telegram频道/群组管理系统 - 设计文档

## 1. 系统架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Web前端 (React)                       │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │账号管理  │任务控制  │模板管理  │日志查看  │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────┴───────────────────────────────────┐
│                  后端服务 (Node.js)                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │              API层 (Express)                      │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────┬──────────┬──────────┬──────────────┐    │
│  │账号服务  │任务调度  │消息服务  │风控服务      │    │
│  └──────────┴──────────┴──────────┴──────────────┘    │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Telegram客户端层 (GramJS)                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│              数据持久层 (SQLite)                         │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │账号表    │任务表    │模板表    │日志表    │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 1.2 技术栈选型

#### 后端

- **运行时**: Node.js 18+
- **语言**: TypeScript 5+
- **Web框架**: Express.js
- **Telegram库**: GramJS (支持MTProto协议)
- **数据库**: SQLite + better-sqlite3
- **任务调度**: node-cron
- **WebSocket**: ws
- **日志**: winston

#### 前端

- **框架**: React 18+
- **语言**: TypeScript 5+
- **UI库**: Ant Design
- **状态管理**: Zustand
- **HTTP客户端**: axios
- **WebSocket客户端**: native WebSocket API
- **构建工具**: Vite

#### 开发工具

- **包管理**: pnpm
- **代码规范**: ESLint + Prettier
- **类型检查**: TypeScript strict mode

## 2. 核心模块设计

### 2.1 账号管理模块

#### 2.1.1 账号实体

```typescript
interface Account {
  id: string; // 账号唯一ID
  phoneNumber: string; // 手机号
  session: string; // 会话字符串（加密存储）
  username?: string; // 用户名
  firstName?: string; // 名字
  lastName?: string; // 姓氏
  status: 'online' | 'offline' | 'restricted'; // 状态
  lastActive: Date; // 最后活跃时间
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
}
```

#### 2.1.2 账号服务

```typescript
class AccountService {
  // 添加账号（登录流程）
  async addAccount(phoneNumber: string): Promise<Account>;

  // 验证验证码
  async verifyCode(accountId: string, code: string): Promise<void>;

  // 验证两步验证密码
  async verifyPassword(accountId: string, password: string): Promise<void>;

  // 获取账号列表
  async getAccounts(): Promise<Account[]>;

  // 删除账号
  async deleteAccount(accountId: string): Promise<void>;

  // 检查账号状态
  async checkAccountStatus(accountId: string): Promise<AccountStatus>;

  // 获取Telegram客户端实例
  getClient(accountId: string): TelegramClient;
}
```

### 2.2 群组/频道管理模块

#### 2.2.1 目标实体

```typescript
interface Target {
  id: string; // 目标唯一ID
  type: 'group' | 'channel'; // 类型
  telegramId: string; // Telegram ID或用户名
  title: string; // 名称
  enabled: boolean; // 是否启用
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2.2.2 目标服务

```typescript
class TargetService {
  // 添加群组/频道
  async addTarget(type: string, identifier: string): Promise<Target>;

  // 获取目标列表
  async getTargets(type?: string): Promise<Target[]>;

  // 更新目标状态
  async updateTargetStatus(targetId: string, enabled: boolean): Promise<void>;

  // 删除目标
  async deleteTarget(targetId: string): Promise<void>;

  // 获取目标详情
  async getTargetInfo(targetId: string): Promise<TargetInfo>;
}
```

### 2.3 消息模板模块

#### 2.3.1 模板实体

```typescript
interface Template {
  id: string; // 模板ID
  category: 'group_message' | 'channel_comment'; // 分类
  content: string; // 模板内容（支持变量）
  enabled: boolean; // 是否启用
  weight: number; // 权重（用于随机选择）
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2.3.2 模板服务

```typescript
class TemplateService {
  // 创建模板
  async createTemplate(data: CreateTemplateDto): Promise<Template>;

  // 获取模板列表
  async getTemplates(category?: string): Promise<Template[]>;

  // 更新模板
  async updateTemplate(id: string, data: UpdateTemplateDto): Promise<Template>;

  // 删除模板
  async deleteTemplate(id: string): Promise<void>;

  // 随机获取模板
  async getRandomTemplate(category: string): Promise<Template>;

  // 渲染模板（替换变量）
  renderTemplate(template: Template, variables: Record<string, any>): string;
}
```

### 2.4 消息发送模块

#### 2.4.1 消息服务

```typescript
class MessageService {
  // 发送群组消息
  async sendGroupMessage(
    accountId: string,
    targetId: string,
    content: string
  ): Promise<MessageResult>;

  // 发送频道评论
  async sendChannelComment(
    accountId: string,
    channelId: string,
    messageId: number,
    content: string
  ): Promise<MessageResult>;

  // 批量发送（带速率控制）
  async sendBatch(messages: MessageTask[]): Promise<BatchResult>;
}
```

#### 2.4.2 消息历史

```typescript
interface MessageHistory {
  id: string;
  accountId: string; // 发送账号
  targetId: string; // 目标群组/频道
  type: 'group_message' | 'channel_comment';
  content: string; // 发送内容
  status: 'success' | 'failed'; // 状态
  error?: string; // 错误信息
  sentAt: Date; // 发送时间
}
```

### 2.5 任务调度模块

#### 2.5.1 任务实体

```typescript
interface Task {
  id: string;
  type: 'group_posting' | 'channel_monitoring';
  accountIds: string[]; // 使用的账号列表
  targetIds: string[]; // 目标列表
  config: TaskConfig; // 任务配置
  status: 'running' | 'stopped'; // 状态
  nextRunAt?: Date; // 下次执行时间
  createdAt: Date;
  updatedAt: Date;
}

interface TaskConfig {
  interval: number; // 间隔（分钟）
  randomDelay: number; // 随机延迟（分钟）
  timeRange?: {
    // 时间范围
    start: string; // HH:mm
    end: string; // HH:mm
  };
  commentProbability?: number; // 评论概率（0-1）
}
```

#### 2.5.2 调度服务

```typescript
class SchedulerService {
  // 创建任务
  async createTask(data: CreateTaskDto): Promise<Task>;

  // 启动任务
  async startTask(taskId: string): Promise<void>;

  // 停止任务
  async stopTask(taskId: string): Promise<void>;

  // 获取任务列表
  async getTasks(): Promise<Task[]>;

  // 更新任务配置
  async updateTask(taskId: string, config: TaskConfig): Promise<Task>;

  // 删除任务
  async deleteTask(taskId: string): Promise<void>;

  // 执行任务
  private async executeTask(task: Task): Promise<void>;
}
```

### 2.6 风控模块

#### 2.6.1 速率限制器

```typescript
class RateLimiter {
  private queues: Map<string, MessageQueue>;

  // 添加消息到队列
  async enqueue(accountId: string, message: Message): Promise<void>;

  // 处理队列（确保每秒最多1条）
  private async processQueue(accountId: string): Promise<void>;

  // 检查是否可以发送
  canSend(accountId: string): boolean;

  // 获取等待时间
  getWaitTime(accountId: string): number;
}
```

#### 2.6.2 FloodWait处理器

```typescript
class FloodWaitHandler {
  // 处理FloodWait错误
  async handleFloodWait(error: FloodWaitError, accountId: string): Promise<void>;

  // 记录限制
  recordLimit(accountId: string, waitSeconds: number): void;

  // 检查账号是否被限制
  isLimited(accountId: string): boolean;

  // 获取解除限制时间
  getUnlockTime(accountId: string): Date;
}
```

#### 2.6.3 账号健康监控

```typescript
class HealthMonitor {
  // 检查账号健康度
  async checkHealth(accountId: string): Promise<HealthStatus>;

  // 记录操作
  recordOperation(accountId: string, operation: Operation): void;

  // 获取健康报告
  getHealthReport(accountId: string): HealthReport;

  // 发送告警
  sendAlert(accountId: string, issue: string): void;
}
```

## 3. 数据库设计

### 3.1 表结构

#### accounts 表

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  session TEXT NOT NULL,           -- 加密存储
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL,
  last_active DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

#### targets 表

```sql
CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- 'group' or 'channel'
  telegram_id TEXT NOT NULL,
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

#### templates 表

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

#### tasks 表

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_ids TEXT NOT NULL,       -- JSON数组
  target_ids TEXT NOT NULL,        -- JSON数组
  config TEXT NOT NULL,            -- JSON对象
  status TEXT NOT NULL,
  next_run_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

#### message_history 表

```sql
CREATE TABLE message_history (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  sent_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (target_id) REFERENCES targets(id)
);

CREATE INDEX idx_message_history_sent_at ON message_history(sent_at);
CREATE INDEX idx_message_history_account_id ON message_history(account_id);
```

#### rate_limits 表

```sql
CREATE TABLE rate_limits (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  unlock_at DATETIME NOT NULL,
  wait_seconds INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_rate_limits_account_id ON rate_limits(account_id);
CREATE INDEX idx_rate_limits_unlock_at ON rate_limits(unlock_at);
```

## 4. API设计

### 4.1 RESTful API

#### 账号管理

```
POST   /api/accounts              # 添加账号（开始登录）
POST   /api/accounts/:id/verify   # 验证验证码
POST   /api/accounts/:id/password # 验证两步验证
GET    /api/accounts              # 获取账号列表
DELETE /api/accounts/:id          # 删除账号
GET    /api/accounts/:id/status   # 获取账号状态
```

#### 目标管理

```
POST   /api/targets               # 添加群组/频道
GET    /api/targets               # 获取目标列表
PATCH  /api/targets/:id           # 更新目标
DELETE /api/targets/:id           # 删除目标
GET    /api/targets/:id/info      # 获取目标详情
```

#### 模板管理

```
POST   /api/templates             # 创建模板
GET    /api/templates             # 获取模板列表
PATCH  /api/templates/:id         # 更新模板
DELETE /api/templates/:id         # 删除模板
POST   /api/templates/:id/preview # 预览模板
```

#### 任务管理

```
POST   /api/tasks                 # 创建任务
GET    /api/tasks                 # 获取任务列表
PATCH  /api/tasks/:id             # 更新任务配置
DELETE /api/tasks/:id             # 删除任务
POST   /api/tasks/:id/start       # 启动任务
POST   /api/tasks/:id/stop        # 停止任务
```

#### 消息历史

```
GET    /api/messages              # 获取消息历史
GET    /api/messages/stats        # 获取统计数据
```

### 4.2 WebSocket API

#### 实时日志

```
ws://localhost:3000/ws/logs
```

消息格式：

```typescript
interface LogMessage {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  accountId?: string;
  message: string;
  details?: any;
}
```

#### 任务状态更新

```
ws://localhost:3000/ws/tasks
```

消息格式：

```typescript
interface TaskUpdate {
  taskId: string;
  status: string;
  nextRunAt?: string;
  lastResult?: any;
}
```

## 5. 风控策略

### 5.1 速率限制策略

- **全局限制**: 每个账号每秒最多1条消息
- **每日限制**: 每个账号每天最多200条消息
- **消息间隔**: 最小间隔1秒，推荐3-5秒
- **随机延迟**: 每次发送前随机延迟0-30秒

### 5.2 FloodWait处理

```typescript
// 遇到FloodWait错误时的处理流程
1. 捕获FloodWaitError
2. 提取等待时间（秒）
3. 记录到rate_limits表
4. 暂停该账号的所有操作
5. 等待指定时间后自动恢复
6. 发送告警通知
```

### 5.3 账号轮换策略

```typescript
// 多账号轮换发送
1. 维护账号池
2. 每次发送选择不同账号
3. 优先选择健康度高的账号
4. 跳过被限制的账号
5. 记录每个账号的使用频率
```

### 5.4 行为模拟

- **时间随机化**: 发送时间添加随机偏移
- **内容多样化**: 使用多个模板随机选择
- **间隔自然化**: 模拟人类操作间隔
- **活跃时段**: 仅在配置的时间段内操作

## 6. 安全设计

### 6.1 数据加密

- 账号session使用AES-256加密存储
- API密钥使用环境变量管理
- 数据库文件权限限制

### 6.2 错误处理

- 所有API调用包装try-catch
- Telegram错误分类处理
- 友好的错误提示
- 详细的错误日志

### 6.3 会话管理

- 使用StringSession持久化会话
- 定期检查会话有效性
- 自动重连机制

## 7. 部署架构

### 7.1 本地部署

```
telegram-manager/
├── backend/          # 后端服务
│   ├── dist/        # 编译输出
│   └── data/        # 数据目录（SQLite）
├── frontend/        # 前端应用
│   └── dist/        # 构建输出
└── config/          # 配置文件
```

### 7.2 启动流程

1. 启动后端服务（端口3000）
2. 后端自动serve前端静态文件
3. 浏览器访问 http://localhost:3000

### 7.3 配置管理

```typescript
// config/default.json
{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "telegram": {
    "apiId": "YOUR_API_ID",
    "apiHash": "YOUR_API_HASH"
  },
  "database": {
    "path": "./data/telegram-manager.db"
  },
  "security": {
    "encryptionKey": "GENERATED_KEY"
  }
}
```

## 8. 监控与日志

### 8.1 日志级别

- **INFO**: 正常操作（发送消息、任务执行）
- **WARN**: 警告信息（速率限制、重试）
- **ERROR**: 错误信息（发送失败、连接错误）

### 8.2 监控指标

- 账号在线状态
- 消息发送成功率
- FloodWait触发次数
- 任务执行状态
- 系统资源使用

### 8.3 告警机制

- 账号被限制时告警
- 连续失败时告警
- 系统异常时告警

## 9. 测试策略

### 9.1 单元测试

- 服务层逻辑测试
- 工具函数测试
- 数据库操作测试

### 9.2 集成测试

- API端点测试
- Telegram客户端集成测试
- 任务调度测试

### 9.3 手动测试

- 账号登录流程
- 消息发送功能
- 风控机制验证
- UI交互测试

## 10. 性能优化

### 10.1 数据库优化

- 合理使用索引
- 定期清理历史数据
- 使用连接池

### 10.2 内存优化

- 限制消息队列大小
- 及时释放Telegram客户端
- 避免内存泄漏

### 10.3 并发控制

- 使用队列管理并发请求
- 限制同时活跃的客户端数量
- 合理设置超时时间
