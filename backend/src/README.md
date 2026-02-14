# Backend 源代码结构

## 目录说明

### `/config`

配置管理模块，负责加载和管理应用配置。

### `/database`

数据库相关代码：

- `/dao` - 数据访问对象（DAO），封装数据库操作
- `/migrations` - 数据库迁移脚本

### `/middleware`

Express中间件：

- `/auth` - 认证中间件
- `/error` - 错误处理中间件
- `/validation` - 请求验证中间件

### `/models`

数据模型定义。

### `/routes`

路由定义：

- `/api` - RESTful API路由
- `/ws` - WebSocket路由

### `/scheduler`

任务调度相关代码。

### `/services`

业务逻辑服务层：

- `/account` - 账号管理服务
- `/target` - 群组/频道管理服务
- `/template` - 消息模板服务
- `/message` - 消息发送服务
- `/scheduler` - 任务调度服务
- `/rateLimit` - 速率限制服务
- `/health` - 健康监控服务

### `/telegram`

Telegram客户端相关：

- `/client` - Telegram客户端封装
- `/handlers` - 事件处理器

### `/types`

TypeScript类型定义。

### `/utils`

工具函数：

- `/logger` - 日志工具
- `/crypto` - 加密工具
- `/helpers` - 辅助函数

## 开发规范

1. 所有服务类应该是单例模式
2. 使用依赖注入管理服务依赖
3. 错误处理统一使用自定义错误类
4. 所有异步操作必须有错误处理
5. 数据库操作必须通过DAO层
6. 业务逻辑放在service层，不要放在route层
