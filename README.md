# Telegram 频道/群组自动化管理系统

用于管理多个 Telegram 账号，在自有群组和频道中执行自动发言、自动评论、日志监控和任务调度。

## 项目介绍

本项目采用前后端分离架构：

- 前端：Web 管理界面（账号、目标、模板、任务、日志、统计、设置）
- 后端：REST API + WebSocket + SQLite 持久化 + Telegram 客户端封装

适合本地部署、自托管使用。

## 技术栈

### 后端

- Node.js + TypeScript
- Express
- SQLite + better-sqlite3
- GramJS
- Winston
- node-cron
- WebSocket (`ws`)

### 前端

- React + TypeScript
- Vite
- Ant Design
- Zustand
- React Router
- Axios

## 架构说明

```text
frontend (5173)
  ├─ 页面层 pages
  ├─ 组件层 components
  ├─ 状态层 stores
  └─ 接口层 services/api + services/websocket

backend (3000)
  ├─ 路由层 routes/api + routes/ws
  ├─ 服务层 services
  ├─ 数据访问层 database/dao
  ├─ 配置层 config
  └─ 基础设施 middleware / utils / telegram
```

## 安装步骤

> 建议使用 Node.js **22 LTS**（或当前可用 LTS 版本）。
>
> `better-sqlite3` 是原生模块，切换 Node 大版本后若出现 ABI 不匹配（`NODE_MODULE_VERSION`）错误，可执行：
>
> ```bash
> pnpm --filter @telegram-manager/backend run native:ensure
> ```
>
> 后端已在 `postinstall` / `pretest` 自动执行该检查与自修复（自动 `pnpm rebuild better-sqlite3`）。

1. 安装依赖

```bash
pnpm install
```

2. 准备环境变量

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. 编辑 `backend/.env`

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `ENCRYPTION_KEY`

## 开发运行

```bash
# 同时启动前后端
pnpm dev

# 或分别启动
pnpm dev:backend
pnpm dev:frontend
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- 健康检查：`http://localhost:3000/health`

## 构建与启动

```bash
# 构建（分别）
pnpm --filter @telegram-manager/backend build
pnpm --filter @telegram-manager/frontend build

# 启动后端生产服务
pnpm --filter @telegram-manager/backend start
```

或使用脚本：

```bash
scripts/build.sh
scripts/start.sh dev
scripts/start.sh prod
```

## Docker（可选）

```bash
docker compose up --build
```

默认仅启动后端服务并暴露 `3000` 端口。

## 功能使用说明

1. 在“账号管理”添加账号（手机号或 session 导入）  
2. 在“目标管理”添加群组/频道  
3. 在“模板管理”创建消息模板  
4. 在“任务管理”创建并启动任务  
5. 在“日志查看”和“仪表板”观察执行状态与统计数据

## 文档索引

- 用户手册：`docs/USER_GUIDE.md`
- 开发者手册：`docs/DEVELOPER_GUIDE.md`
- Workspace 指南：`WORKSPACE.md`
- 目录结构：`docs/PROJECT_STRUCTURE.md`

## 免责声明

仅用于学习与研究。请确保使用行为符合 Telegram 服务条款和当地法律法规。
