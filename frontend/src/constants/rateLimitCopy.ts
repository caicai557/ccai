export const RATE_LIMIT_COPY = {
  settingsInfoTitle: '当前速率限制按单账号生效',
  settingsInfoBullets: [
    '规则生效维度：单个账号。',
    '多账号并行时，总发送量会线性放大。',
    '建议先用保守参数灰度运行，再逐步放量。',
  ],
  perAccountTooltip: '按单账号计算，不是全账号总量上限。',
  estimatorTitle: '并行账号总吞吐估算器',
  estimatorHint: '仅用于估算总吞吐，不会写入系统配置。',
  estimatorWarning: '并行账号数大于 1 时，总发送量会放大，账号风控概率会上升。',
  taskFormHint:
    '本任务受所选账号的单账号限速控制；多任务若使用不同账号并发执行，总吞吐会叠加。',
  taskListHint: '系统限速按单账号生效，多个账号并发会放大总发送量。',
} as const;

