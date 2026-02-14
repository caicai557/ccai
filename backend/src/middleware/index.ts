import { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '../utils/logger';

/**
 * 配置所有中间件
 */
export const setupMiddleware = (app: Express): void => {
  // 安全中间件 - helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // 开发环境下禁用CSP
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS中间件
  app.use(
    cors({
      origin: process.env['CORS_ORIGIN'] || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Body解析中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 请求日志中间件
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  logger.info('✅ 中间件配置完成');
};
