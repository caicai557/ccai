# Autosend 阶段B｜详细执行方案（评审版）

> 版本：v1
> 目标：在不做大规模重构前提下，完成 P0→P1 稳定性与可用性提升。

## 1. 目标与范围

### In Scope
1. 任务模型与前后端契约一致性（状态/类型/统计字段）
2. 启动前预检结果可视化与失败原因可解释（沿用现有 precheck 结构）
3. 统计口径修复与关键看板准确性（today 与任务活跃率/目标统计）
4. 本地验证与测试回归，给出可跑通交付

### Out of Scope
1. 引入新数据库引擎或分布式队列
2. 全量错误协议重构到 RFC7807（本轮先留扩展位）
3. 大规模 UI 重设计
4. Telegram 执行链路的深层重写

---

## 2. 现状问题与根因

1. **任务状态契约偏差**
- 现状：后端状态仅 `running/stopped`，前端历史包含 `paused/error` 本地态。
- 根因：前端沿用旧模型，pause 接口语义与 stop 实际一致。

2. **统计口径不一致**
- 现状：任务活跃率使用账号总数作为分母；目标统计未接入后端。
- 根因：Dashboard 聚合字段与前端展示字段定义未同步。

3. **预检可解释性“有数据，弱呈现”**
- 现状：后端已返回 `blockedReasons`，前端仅弹窗提示。
- 根因：缺少固定展示位和可复查痕迹。

---

## 3. 目标架构与数据/接口变更

## 3.1 架构原则
- 后端保持 `TaskService` 为单一调度入口。
- 前端通过 API adapter 做模型映射，不让页面直接依赖后端内部字段。
- 统计看板以 `/api/stats/dashboard` 为主聚合源。

## 3.2 数据与接口变更（本轮）
1. `/api/stats/dashboard` 增加 `targets: { total, active }`
2. `/api/stats/dashboard.executions` 统一为“今日”口径
3. 前端 `DashboardStats` 增加 `totalTasks`
4. 前端任务状态类型收敛为 `running|stopped`

---

## 4. 风险与回滚策略

1. 风险：前端状态收敛导致历史页面逻辑分支失效
- 缓解：保留 pause 按钮，但明确“暂停=停止”语义
- 回滚：恢复 `paused` 前端本地态（不动后端）

2. 风险：统计口径切换引发“数据看起来变少”
- 缓解：在文档注明 executions 为“今日”统计
- 回滚：恢复 7 天统计并新增字段区分 today/7d

3. 风险：脏工作区存在既有改动，提交污染
- 缓解：按文件精确 add；每次 commit 前检查 diff

---

## 5. 验收标准与指标

1. 合同一致性
- 前端任务状态类型与后端一致（running/stopped）
- 任务页启停流程无类型错误、无运行时错误

2. 预检可解释性
- 启动任务时能显示 ready/blocked 数量及 blockedReasons
- strict 策略失败时错误提示可读

3. 统计准确性
- Dashboard 显示真实 targets 总数/活跃数
- 任务活跃率 = runningTasks / totalTasks
- todayMessages 与今日执行数一致

4. 质量门禁
- `pnpm -r install`
- `pnpm lint`
- `pnpm -r exec tsc --noEmit`
- `pnpm --filter @telegram-manager/backend test`
- `pnpm build`

---

## 6. 细粒度任务拆分（Epic → Story → Task）

## Epic P0-1：契约一致性
### Story S1：任务状态契约收敛
- Task T1
  - 输入：后端任务状态定义
  - 输出：前端状态类型仅 running/stopped
  - 改动文件：`frontend/src/types/task.ts`, `frontend/src/services/api/tasks.ts`, `frontend/src/pages/Tasks/TaskList.tsx`
  - DoD：TypeScript 编译通过；任务页无 paused 分支依赖
  - 测试点：启动、暂停、停止按钮行为

## Epic P0-2：预检可解释性
### Story S2：启动结果清晰反馈
- Task T2
  - 输入：后端 startTask 返回 precheck
  - 输出：前端 toast 显示 ready/blocked/reasons
  - 改动文件：`frontend/src/pages/Tasks/TaskList.tsx`
  - DoD：阻塞时可看到具体原因码统计
  - 测试点：partial/strict 两种策略

## Epic P1-1：统计口径修复
### Story S3：看板字段对齐
- Task T3
  - 输入：stats 路由、Dashboard 映射逻辑
  - 输出：增加 targets 统计 + totalTasks + 正确活跃率分母
  - 改动文件：`backend/src/routes/api/stats.ts`, `frontend/src/services/api/stats.ts`, `frontend/src/types/common.ts`, `frontend/src/pages/Dashboard/Dashboard.tsx`
  - DoD：看板指标与后端返回一致
  - 测试点：`/api/stats/dashboard` 返回字段完整；前端显示正确

## Epic D：集成验证与交付
### Story S4：全量命令验证
- Task T4
  - 输入：完整代码
  - 输出：命令执行日志与结论
  - 改动文件：无（结果写入交付报告）
  - DoD：必跑命令全部通过或有可复现问题说明
  - 测试点：CI 等价命令逐项执行
