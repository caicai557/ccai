# Autosend 阶段A｜深度调研（架构事实 + 外部参考）

> 产出时间：2026-02-16
> 原则：仅记录“代码中可验证事实”，不做主观猜测。

## 1) 当前架构事实清单（基于仓库代码）

## 1.1 工程与运行形态
- Monorepo（pnpm workspace）包含 `backend` + `frontend` 两个包（`pnpm-workspace.yaml`）。
- 根脚本支持 `pnpm dev / lint / build` 以及分包执行（`package.json`）。
- 后端：Express + SQLite(better-sqlite3) + ws + node-cron + GramJS（`backend/package.json`）。
- 前端：React + Vite + Antd + Zustand + Axios（`frontend/package.json`）。

## 1.2 数据模型（后端）
- 核心表：`accounts / targets / templates / tasks / task_executions / logs / message_history`（`backend/src/database/schema.ts`）。
- `tasks` 表字段为：`type, account_ids(JSON), target_ids(JSON), config(JSON), status(running|stopped), priority(1-10)`。
- 任务执行历史落库在 `task_executions`，含 `success、error_message、retry_count`，支持按任务和账号统计（`TaskExecutionDao`）。

## 1.3 任务域模型与调度执行
- 后端任务类型：`group_posting | channel_monitoring`（`backend/src/types/task.ts`）。
- TaskService 支持：
  - 任务 CRUD、启动/停止/暂停（暂停=stop 别名）；
  - 启动前预检（account-target 组合预检）；
  - 预检策略 `partial | strict`；
  - 失败阻塞组合收集与原因聚合 `blockedReasons`；
  - 群发任务使用 cron 周期执行；
  - 频道监听任务注册消息监听回调（`backend/src/services/scheduler/TaskService.ts`）。
- 启动返回结构包含 `precheck`，可携带可用/阻塞组合详情（`TaskStartResult`）。

## 1.4 错误码与可解释性（当前状态）
- 预检失败有明确业务错误码集合：
  `TARGET_NOT_JOINED / TARGET_JOIN_PENDING / TARGET_WRITE_FORBIDDEN / ...`（`backend/src/types/task.ts`）。
- `POST /api/tasks/:id/start` 已将预检失败类错误映射为 400（`backend/src/routes/api/tasks.ts`）。
- 全局错误响应仍以 message 为主，尚未统一为结构化错误码协议（`backend/src/middleware/errorHandler.ts`）。

## 1.5 实时状态与看板
- 后端通过 ws 广播任务状态：`status、lastExecutedAt、nextExecutionAt、successCount、failureCount`（`TaskService.broadcastTaskStatus`）。
- 前端任务页订阅 ws 并实时更新状态与统计（`frontend/src/pages/Tasks/TaskList.tsx`）。
- 仪表板接口位于 `/api/stats/*`，含账号/任务/执行/日志聚合统计（`backend/src/routes/api/stats.ts`）。

## 1.6 前后端契约现状（已识别问题）
- 后端任务状态只有 `running|stopped`；前端历史上包含 `paused|error` 本地态，存在语义偏差（`frontend/src/types/task.ts`, `TaskList.tsx`）。
- 前端任务类型展示用 `send_message|auto_comment`，通过 API 映射到后端 `group_posting|channel_monitoring`（`frontend/src/services/api/tasks.ts`）。
- 仪表板统计口径历史存在偏差：任务活跃率曾以账号总数为分母；目标数曾固定为 0（已在阶段C修复）。

---

## 2) 外部优秀参考（任务调度/营销自动化/社媒自动化）

> 说明：当前环境 `web_search` 未配置 Brave API Key，改为直接查阅官方文档 URL。

1. Temporal Retry Policy
- 参考：<https://docs.temporal.io/encyclopedia/retry-policies>
- 借鉴点：声明式重试策略、指数退避、可视化重试模拟器、默认重试与不可重试错误区分。

2. Apache Airflow Task 生命周期
- 参考：<https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html>
- 借鉴点：任务实例状态机（scheduled/queued/running/...）、依赖关系显式化、执行状态可观测。

3. n8n 错误处理
- 参考：<https://docs.n8n.io/flow-logic/error-handling/>
- 借鉴点：失败分流到错误工作流、错误上下文（execution/workflow/retryOf）可追踪。

4. Huginn 事件驱动自动化
- 参考：<https://github.com/huginn/huginn>
- 借鉴点：Agent 通过事件图衔接，输入/输出事件可组合，适合“预检→执行→回收”链路拆分。

5. RFC 7807（现已被 RFC9457 更新）
- 参考：<https://www.rfc-editor.org/rfc/rfc7807>
- 借鉴点：HTTP API 错误标准化（type/title/status/detail/instance），利于前后端一致解释失败原因。

---

## 3) 可迁移设计模式 + 对应实现范式（为何适合 autosend）

1. **预检即计划（Preflight as Plan）**
- 模式：在“启动任务”前先产出可执行组合与阻塞组合，再决定是否启动。
- Autosend 落点：已具备 `readyPairs / blockedPairs / blockedReasons`，继续强化前端可视化即可。
- 适配原因：Telegram 账号/群组权限波动大，先预检可显著降低“启动后秒失败”。

2. **错误码优先（Code-first Failure）**
- 模式：错误处理从“文本 message”升级到“稳定错误码 + 可读消息”。
- Autosend 落点：以现有 TargetAccessErrorCode 为核心，逐步扩到 API 层统一响应结构。
- 适配原因：运营同学更需要“可聚合、可统计、可筛选”的失败原因，而非自由文本。

3. **统计双轨：实时态 + 持久态**
- 模式：实时看板依赖 ws 内存态；历史与报表依赖 DB 聚合。
- Autosend 落点：TaskService 已广播实时计数，TaskExecutionDao 已支持历史聚合。
- 适配原因：兼顾“运维即时观察”和“复盘审计”。

4. **契约适配层（API Adapter）**
- 模式：前端内部模型与后端模型不同步时，统一由 API adapter 做映射。
- Autosend 落点：`frontend/services/api/tasks.ts` 已承担映射；需继续压缩语义分歧（状态/口径）。
- 适配原因：降低联调成本，避免 UI 直接耦合数据库结构。

5. **最小高价值改动（MVP Hardening）**
- 模式：优先修复 P0/P1 高风险项（契约一致、预检可解释、统计口径），避免无关重构。
- Autosend 落点：本轮执行仅改任务契约与看板统计，不触及大规模目录重构。
- 适配原因：当前代码已有较高覆盖测试，宜“稳态演进”。
