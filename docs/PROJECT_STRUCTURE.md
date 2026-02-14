# 项目目录结构

本文档描述了Telegram频道/群组管理系统的完整目录结构。

## 整体结构

```
telegram-manager/
├── backend/              # 后端服务
├── frontend/             # 前端应用
├── config/               # 配置文件
├── docs/                 # 项目文档
├── .kiro/                # Kiro AI配置
└── .vscode/              # VS Code配置
```

## Backend 目录结构

```
backend/
├── src/
│   ├── config/           # 配置管理模块
│   ├── database/         # 数据库相关
│   │   ├── dao/         # 数据访问对象
│   │   └── migrations/  # 数据库迁移脚本
│   ├── middleware/       # Express中间件
│   │   ├── auth/        # 认证中间件
│   │   ├── error/       # 错误处理中间件
│   │   └── validation/  # 请求验证中间件
│   ├── models/           # 数据模型定义
│   ├── routes/           # 路由定义
│   │   ├── api/         # RESTful API路由
│   │   └── ws/          # WebSocket路由
│   ├── scheduler/        # 任务调度
│   ├── services/         # 业务逻辑服务层
│   │   ├── account/     # 账号管理服务
│   │   ├── target/      # 群组/频道管理服务
│   │   ├── template/    # 消息模板服务
│   │   ├── message/     # 消息发送服务
│   │   ├── scheduler/   # 任务调度服务
│   │   ├── rateLimit/   # 速率限制服务
│   │   └── health/      # 健康监控服务
│   ├── telegram/         # Telegram客户端相关
│   │   ├── client/      # Telegram客户端封装
│   │   └── handlers/    # 事件处理器
│   ├── types/            # TypeScript类型定义
│   │   ├── account.ts   # 账号类型
│   │   ├── target.ts    # 目标类型
│   │   ├── template.ts  # 模板类型
│   │   ├── message.ts   # 消息类型
│   │   ├── task.ts      # 任务类型
│   │   ├── common.ts    # 通用类型
│   │   └── index.ts     # 类型导出
│   ├── utils/            # 工具函数
│   │   ├── logger/      # 日志工具
│   │   ├── crypto/      # 加密工具
│   │   └── helpers/     # 辅助函数
│   ├── index.ts          # 应用入口
│   └── README.md         # 源码说明文档
├── data/                 # 数据目录（SQLite数据库）
├── logs/                 # 日志文件目录
├── dist/                 # 编译输出目录
├── package.json          # 依赖配置
└── tsconfig.json         # TypeScript配置
```

## Frontend 目录结构

```
frontend/
├── src/
│   ├── components/       # React组件
│   │   ├── Layout/      # 布局组件
│   │   ├── Common/      # 通用组件
│   │   ├── Account/     # 账号相关组件
│   │   ├── Target/      # 目标相关组件
│   │   ├── Template/    # 模板相关组件
│   │   └── Task/        # 任务相关组件
│   ├── pages/            # 页面组件
│   │   ├── Dashboard/   # 仪表板页面
│   │   ├── Accounts/    # 账号管理页面
│   │   ├── Targets/     # 群组/频道管理页面
│   │   ├── Templates/   # 消息模板管理页面
│   │   ├── Tasks/       # 任务管理页面
│   │   └── Logs/        # 日志查看页面
│   ├── services/         # 服务层
│   │   ├── api/         # API请求封装
│   │   └── websocket/   # WebSocket连接管理
│   ├── stores/           # 状态管理（Zustand）
│   │   ├── account/     # 账号状态
│   │   ├── target/      # 目标状态
│   │   ├── template/    # 模板状态
│   │   ├── task/        # 任务状态
│   │   └── log/         # 日志状态
│   ├── types/            # TypeScript类型定义
│   │   ├── account.ts   # 账号类型
│   │   ├── target.ts    # 目标类型
│   │   ├── template.ts  # 模板类型
│   │   ├── message.ts   # 消息类型
│   │   ├── task.ts      # 任务类型
│   │   ├── common.ts    # 通用类型
│   │   └── index.ts     # 类型导出
│   ├── utils/            # 工具函数
│   ├── hooks/            # 自定义React Hooks
│   ├── App.tsx           # 应用根组件
│   ├── main.tsx          # 应用入口
│   ├── index.css         # 全局样式
│   └── README.md         # 源码说明文档
├── dist/                 # 构建输出目录
├── index.html            # HTML模板
├── package.json          # 依赖配置
├── tsconfig.json         # TypeScript配置
└── vite.config.ts        # Vite配置
```

## Config 目录结构

```
config/
├── default.json          # 默认配置文件
├── .gitignore            # 配置文件忽略规则
└── README.md             # 配置说明文档
```

### 配置文件说明

- `default.json` - 默认配置，包含所有配置项的默认值
- `local.json` - 本地开发配置（不提交到版本控制）
- `production.json` - 生产环境配置（不提交到版本控制）

## 关键目录说明

### Backend Data 目录

存储SQLite数据库文件和其他持久化数据。此目录已添加到.gitignore，不会被提交到版本控制。

### Backend Logs 目录

存储应用程序日志文件。日志文件会自动按日期轮转。此目录已添加到.gitignore。

### Types 目录

前后端都有独立的types目录，包含各自的TypeScript类型定义。类型定义保持前后端一致，便于数据交互。

## 占位文件

所有空目录都包含`.gitkeep`文件，用于：

1. 保持目录结构在版本控制中
2. 提供目录用途说明（通过注释）

## 开发规范

### Backend

1. 所有业务逻辑放在services层
2. 数据库操作必须通过DAO层
3. 路由层只负责请求处理和响应
4. 使用依赖注入管理服务依赖

### Frontend

1. 组件按功能模块组织
2. 页面组件放在pages目录
3. 可复用组件放在components目录
4. 状态管理使用Zustand
5. API调用统一通过services层

## 下一步

参考设计文档继续实现各个模块的功能。
