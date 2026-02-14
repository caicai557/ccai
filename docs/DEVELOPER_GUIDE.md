# 开发者手册

本手册面向项目开发者，覆盖架构、接口、开发流程和贡献规范。

## 1. 项目架构说明

## 1.1 Monorepo 结构

- `backend`：Node.js + Express + SQLite + GramJS
- `frontend`：React + Vite + Zustand + Ant Design
- `docs`：项目文档
- `config`：默认配置

## 1.2 后端分层

- `src/routes`：HTTP 与 WebSocket 路由
- `src/services`：业务逻辑层
- `src/database/dao`：数据访问层
- `src/telegram`：Telegram 客户端封装
- `src/middleware`：错误处理和通用中间件

## 1.3 前端分层

- `src/pages`：业务页面
- `src/components`：可复用组件
- `src/services/api`：接口访问层
- `src/services/websocket`：实时通信
- `src/stores`：状态管理

## 2. API 文档（核心接口）

接口前缀均为 `/api`，返回格式统一为：

```json
{
  "success": true,
  "data": {}
}
```

## 2.1 账号

- `POST /api/accounts/phone` 发送验证码
- `POST /api/accounts/verify` 提交验证码
- `POST /api/accounts/verify-password` 提交两步验证密码
- `POST /api/accounts/import` 导入 `.session`
- `GET /api/accounts` 查询账号列表
- `GET /api/accounts/:id/status` 查询账号状态

## 2.2 目标

- `POST /api/targets`
- `GET /api/targets`
- `PUT /api/targets/:id`
- `DELETE /api/targets/:id`

## 2.3 模板

- `POST /api/templates`
- `GET /api/templates`
- `GET /api/templates/:id`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`
- `GET /api/templates/:id/preview`

## 2.4 任务

- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/start`
- `POST /api/tasks/:id/stop`
- `POST /api/tasks/:id/pause`
- `GET /api/tasks/:id/history`

## 2.5 统计与配置

- `GET /api/stats/dashboard`
- `GET /api/stats/accounts`
- `GET /api/stats/tasks`
- `GET /api/config`
- `PUT /api/config`

## 2.6 WebSocket

- 地址：`ws://<host>:3000`
- 订阅消息：
```json
{ "type": "subscribe", "data": { "subscriptions": ["tasks"] } }
```
- 常见推送类型：
  - `account_status`
  - `task_status`
  - `new_log`

## 3. 本地开发流程

1. 安装依赖：
```bash
pnpm install
```

2. 配置环境变量：
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. 启动开发：
```bash
pnpm dev
```

4. 常用命令：
```bash
pnpm lint
pnpm format:check
pnpm build
```

## 4. 贡献指南

1. 先开分支再开发，分支建议以 `codex/` 前缀命名。  
2. 一次只提交一个明确变更，避免混合重构与功能修改。  
3. 接口变更必须同步更新：
- 前端 `services/api`
- 对应文档（`README` / `docs`）

4. 提交前至少做一次本地冒烟：
- `GET /health`
- `GET /api`
- 关键功能页手动点通

5. 合并请求建议包含：
- 改动目的
- 影响范围
- 验证步骤
- 回滚方案
