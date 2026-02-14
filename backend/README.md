# Telegram频道管理系统 - 后端

## 技术栈

- Node.js 18+
- TypeScript 5+
- Express.js
- SQLite + better-sqlite3
- GramJS (Telegram客户端)
- Winston (日志)
- node-cron (任务调度)

## 目录结构

```
backend/
├── src/
│   ├── index.ts           # 入口文件
│   ├── config/            # 配置管理
│   ├── services/          # 业务服务
│   ├── routes/            # API路由
│   ├── models/            # 数据模型
│   ├── database/          # 数据库访问层
│   ├── telegram/          # Telegram客户端封装
│   ├── scheduler/         # 任务调度
│   ├── middleware/        # 中间件
│   └── utils/             # 工具函数
├── data/                  # 数据目录（运行时创建）
├── logs/                  # 日志目录（运行时创建）
└── config/                # 配置文件
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 生产运行
pnpm start
```

## 配置

复制 `.env.example` 为 `.env` 并填写配置信息。
