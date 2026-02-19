import { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '../utils/logger';

const parseCorsOrigins = (rawOrigins?: string): string[] => {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

/**
 * 配置所有中间件
 */
export const setupMiddleware = (app: Express): void => {
  const allowedOrigins = parseCorsOrigins(process.env['CORS_ORIGIN']);
  const fallbackOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ];
  const effectiveOrigins = allowedOrigins.length > 0 ? allowedOrigins : fallbackOrigins;

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
      origin: (origin, callback) => {
        // 无Origin通常是服务端/命令行调用，默认放行
        if (!origin) {
          callback(null, true);
          return;
        }

        if (effectiveOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        if (effectiveOrigins.includes('*')) {
          callback(null, true);
          return;
        }

        logger.warn(`CORS拒绝来源: ${origin}`);
        callback(null, false);
      },
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
  logger.info(`CORS允许来源: ${effectiveOrigins.join(', ')}`);
};
