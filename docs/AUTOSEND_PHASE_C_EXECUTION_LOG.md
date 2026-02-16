# Autosend 阶段C｜执行记录（P0→P1）

## 执行批次 1（P0：契约一致性）
- 完成项：
  - 前端任务状态类型收敛为 `running|stopped`
  - `getByStatus` 入参收敛为 `running|stopped`
  - pause 操作文案与行为统一为“暂停即停止”
- 改动文件：
  - `frontend/src/types/task.ts`
  - `frontend/src/services/api/tasks.ts`
  - `frontend/src/pages/Tasks/TaskList.tsx`
- 本地验证：
  - `pnpm -r exec tsc --noEmit` ✅

## 执行批次 2（P1：统计口径修复）
- 完成项：
  - 后端 dashboard 增加 targets 聚合
  - executions 口径改为“今日”
  - 前端 DashboardStats 增加 `totalTasks`
  - 任务活跃率分母改为 `totalTasks`
  - 前端接入后端 targets 字段
- 改动文件：
  - `backend/src/routes/api/stats.ts`
  - `frontend/src/types/common.ts`
  - `frontend/src/services/api/stats.ts`
  - `frontend/src/pages/Dashboard/Dashboard.tsx`
- 本地验证：
  - `pnpm -r exec tsc --noEmit` ✅
  - `pnpm --filter @telegram-manager/backend test` ✅

## 执行原则落地
- 全程采用最小高价值改动，未做目录级重构。
- 每批完成后立即验证，未堆积到最后统一修。