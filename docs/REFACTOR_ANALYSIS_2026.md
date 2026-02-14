# 深度问题分析（2026-02-13）

## 一、执行结论

当前项目处于“功能可演示、工程不可持续”状态，核心阻塞不是功能缺失，而是质量基线未闭环。

## 二、基线检查结果

## 2.1 构建状态

- 后端 `pnpm --filter @telegram-manager/backend build` 失败。  
  主要问题：
  - 严格 TS 规则触发（`noUnusedParameters`、`noImplicitOverride`、`noPropertyAccessFromIndexSignature`）。
  - 类型和实现不一致。
  - 典型文件：
    - `/Users/cai/cai-code/autosend/backend/src/database/migrations.ts`
    - `/Users/cai/cai-code/autosend/backend/src/middleware/errorHandler.ts`
    - `/Users/cai/cai-code/autosend/backend/src/services/rateLimit/RateLimiter.ts`
    - `/Users/cai/cai-code/autosend/backend/src/services/template/TemplateService.ts`

- 前端 `pnpm --filter @telegram-manager/frontend build` 失败。  
  主要问题：
  - 浏览器工程引用 Node 全局（`process`）。
  - React 组件和类型定义不匹配。
  - 严格 TS 下索引签名/可选值处理不足。
  - 典型文件：
    - `/Users/cai/cai-code/autosend/frontend/src/components/Common/ErrorBoundary.tsx`
    - `/Users/cai/cai-code/autosend/frontend/src/utils/errorHandler.ts`
    - `/Users/cai/cai-code/autosend/frontend/src/services/api/client.ts`

## 2.2 静态检查状态

- 后端 `pnpm --filter @telegram-manager/backend lint` 失败（错误和告警大量）。  
  关键阻塞：
  - 多个 `*.test.ts` 不在 `parserOptions.project` 覆盖范围内。
  - Node 全局未完整声明导致 `no-undef`。
  - 规则与工程实际不一致。

- 前端 `pnpm --filter @telegram-manager/frontend lint` 失败。  
  关键阻塞：
  - 浏览器全局未完整声明（`setTimeout`、`clearInterval`、`localStorage`）。
  - 部分组件 `React` 作用域与规则冲突。
  - Prettier 与 ESLint 校验未统一闭环。

## 2.3 测试状态

- 后端 `pnpm --filter @telegram-manager/backend test` 存在高噪音与不稳定。  
  关键风险：
  - 属性测试和数据库生命周期耦合，出现 `database connection is not open`。
  - 测试中多次出现 `no such column: health_score`，证明 schema 与 DAO 发生漂移。
  - 测试分层不清，日常流水线成本过高且结果不稳定。

## 三、根因分析（按优先级）

## P0：数据模型单一真相缺失

- 现象：
  - `accounts` 表定义在 schema 不含 `health_score`。
  - DAO 和服务层大量依赖 `health_score` 字段。
- 证据文件：
  - `/Users/cai/cai-code/autosend/backend/src/database/schema.ts`
  - `/Users/cai/cai-code/autosend/backend/src/database/dao/AccountDao.ts`
  - `/Users/cai/cai-code/autosend/backend/src/services/rateLimit/RateLimiter.ts`
- 影响：
  - 运行期和测试期 SQL 失败，功能不可预测。

## P0：契约模型双轨并存

- 现象：
  - 后端任务/模板模型与前端模型概念不一致（命名、字段、状态域）。
  - 前端通过手写适配补洞，耦合高且易漂移。
- 证据文件：
  - `/Users/cai/cai-code/autosend/backend/src/types/task.ts`
  - `/Users/cai/cai-code/autosend/frontend/src/types/task.ts`
  - `/Users/cai/cai-code/autosend/backend/src/types/template.ts`
  - `/Users/cai/cai-code/autosend/frontend/src/types/template.ts`

## P1：工程规则与运行环境不一致

- 现象：
  - TS 和 ESLint 都开启了严格规则，但 env/lib/project 配置不闭环。
  - 同时存在 Node 和浏览器边界误用。
- 证据文件：
  - `/Users/cai/cai-code/autosend/backend/tsconfig.json`
  - `/Users/cai/cai-code/autosend/frontend/tsconfig.json`
  - `/Users/cai/cai-code/autosend/backend/eslint.config.mjs`
  - `/Users/cai/cai-code/autosend/frontend/eslint.config.mjs`

## P1：配置源重复

- 现象：
  - 存在根级与 backend 级默认配置并存，语义接近但路径和内容不同。
- 证据文件：
  - `/Users/cai/cai-code/autosend/config/default.json`
  - `/Users/cai/cai-code/autosend/backend/config/default.json`
- 影响：
  - 配置取值行为不透明，故障难定位。

## 四、重构目标（稳定上线导向）

1. 先达成“质量基线全绿”：build/lint/test（稳定集）可重复通过。  
2. 建立单一数据真相：schema/migration/dao 一致。  
3. 建立单一契约真相：后端契约驱动前端消费。  
4. 建立发布质量门：CI 强制检查 + 可演练回滚。  

## 五、非目标（当前阶段不做）

1. 不做 UI 风格重做。  
2. 不做性能极限优化。  
3. 不做新业务功能扩展。  
