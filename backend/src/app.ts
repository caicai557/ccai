/**
 * Express应用配置
 */
import express, { Application } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import apiRoutes from './routes/api';
import { setupMiddleware } from './middleware';

/**
 * 创建并配置Express应用
 */
export function createApp(): Application {
  const app = express();

  // 统一中间件装配（避免与旧后端逻辑重复）
  setupMiddleware(app);

  // 健康检查端点
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // API路由
  app.use('/api', apiRoutes);

  // 404错误处理
  app.use(notFoundHandler);

  // 全局错误处理中间件（必须放在最后）
  app.use(errorHandler);

  logger.info('✅ Express应用配置完成');

  return app;
}
