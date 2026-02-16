# 马尼拉发现能力任务拆解（Epic → Story → Task）

## Epic A：方案与设计
### Story A1：形成可执行方案
- Task A1-1（实施方案文档）
  - 输入：业务目标/约束
  - 输出：`docs/MANILA_DISCOVERY_IMPLEMENTATION_PLAN.md`
  - 改动文件：docs 文档
  - DoD：包含架构、模型、API、错误码、安全、Gemini降级
  - 测试点：文档评审通过

### Story A2：任务拆解
- Task A2-1（Epic/Story/Task）
  - 输入：实施方案
  - 输出：`docs/MANILA_DISCOVERY_TASK_BREAKDOWN.md`
  - DoD：每个 Task 含输入/输出/文件/DoD/测试点

## Epic B：后端P0闭环
### Story B1：候选入库模型
- Task B1-1（表与DAO）
  - 输入：候选字段定义
  - 输出：`discovery_candidates` + `DiscoveryCandidateDao`
  - 改动：`schema.ts`, `migrations.ts`, `dao/*`
  - DoD：可增查改状态，支持分页查询
  - 测试点：API查询返回空列表结构正确

### Story B2：规则筛选器
- Task B2-1（马尼拉白/黑名单）
  - 输出：`ManilaRulesScorer`
  - DoD：manila命中通过，cebu命中拒绝
  - 测试点：`ManilaRulesScorer.test.ts`

### Story B3：Gemini评分器
- Task B3-1（Gemini封装）
  - 输出：`GeminiScorer`
  - DoD：可返回结构化概率；无Key自动降级
  - 测试点：`GeminiScorer.test.ts`

### Story B4：流程API
- Task B4-1（run/candidates/accept）
  - 输出：`/api/discovery/*`
  - 改动：`routes/api/discovery.ts`, `routes/api/index.ts`
  - DoD：三接口可访问；accept可写入targets
  - 测试点：`api.integration.test.ts`新增三路由用例

## Epic C：前端P0落地
### Story C1：目标页增加智能发现入口
- Task C1-1（配置与执行）
  - 输入：accountId/关键词/dryRun/阈值
  - 输出：调用 run 接口
  - 改动：`frontend/src/pages/Targets/TargetList.tsx`, `services/api/discovery.ts`
  - DoD：可触发发现并展示结果

### Story C2：候选列表与入库
- Task C2-1（列表展示+勾选+一键入库）
  - 输出：显示规则分/AI分/总分/拒绝原因，支持批量 accept
  - DoD：入库结果有 created/duplicated/failed 提示

## Epic D：验证与交付
### Story D1：测试与构建
- Task D1-1（执行验证命令）
  - 输出：lint/tsc/test/build 结果
  - DoD：关键命令完成并记录
