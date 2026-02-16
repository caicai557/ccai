# 马尼拉华人群/频道自动发现与入库实施方案（P0）

## 1. 架构与数据流
1. 触发：`POST /api/discovery/run`
2. 采集：按关键词调用 Telegram `searchTargets`（账号已登录上下文）
3. 可达校验：对每个候选调用 `resolveTarget` 判断当前账号是否可达
4. 规则评分：`ManilaRulesScorer`
   - 白名单：manila/makati/pasay/taguig/bgc/quezon/ncr/马尼拉
   - 黑名单：cebu/宿务（直接拒绝）
5. AI评分：`GeminiScorer`
   - 模型优先 `gemini-3-flash-preview`
   - 输出结构化 JSON（probability/reason）
6. 合成分：`final = 0.6*rules + 0.4*ai`（AI失败时仅规则分）
7. 入库候选：`discovery_candidates`
8. 批量接收：`POST /api/discovery/accept` → 转入 `targets`

## 2. 数据模型（discovery_candidates）
- 核心字段：
  - `source`, `type`, `title`, `username`, `invite_link`, `telegram_id`, `account_id`
  - `region_hint`, `description`, `recent_message_summary`
  - `rules_score`, `ai_score`, `final_score`
  - `status`（pending/accepted/rejected）
  - `reason`, `reachability_status`
  - `ai_provider`, `ai_model`, `ai_raw`
  - `trace_id`（追踪一次 run）
  - `created_at`, `updated_at`

## 3. API 设计
### POST /api/discovery/run
- 入参：`accountId`(必填), `keywords[]`, `dryRun`, `threshold`, `maxPerKeyword`, `sourceTypes`
- 出参：`traceId/scanned/accepted/rejected/items/errors`

### GET /api/discovery/candidates
- 入参：`status/source/minFinalScore/page/pageSize`
- 出参：`items/total/page/pageSize`

### POST /api/discovery/accept
- 入参：`candidateIds[]`
- 出参：`created/duplicated/failed/summary`

## 4. 错误码与回滚策略
- `400` 参数错误（如 accountId 缺失、candidateIds 为空）
- `500` 外部依赖异常（Telegram/Gemini）
- 回滚策略：
  - `run` 逐条处理，单条失败不影响全局
  - `accept` 单条失败记录到 `failed`，其余继续
  - 通过 `trace_id` 支持按批次追踪/审计

## 5. 安全与速率限制
- 外部调用可开关：
  - `DISCOVERY_ENABLED`
  - `DISCOVERY_GEMINI_ENABLED`
- 密钥来源：仅环境变量 `GEMINI_API_KEY`
- 不在日志打印明文密钥
- Gemini 请求超时：`GEMINI_TIMEOUT_MS`

## 6. Gemini 接入与降级
- 接口：`v1beta/models/{model}:generateContent`
- 推荐模型：`gemini-3-flash-preview`
- 失败降级：
  - 缺失 Key、超时、非200、JSON解析失败 → 返回 error/skipped
  - 评分流程继续，仅使用规则分，不阻塞 run
