import type http from 'http';
import { DaoFactory } from './database/dao';
import { getDatabase, closeDatabase } from './database/init';
import { initSchema } from './database/schema';
import { runMigrations } from './database/migrations';
import { createServer, startServer, shutdownServer } from './server';
import { logger } from './utils/logger';

let server: http.Server | null = null;
let shuttingDown = false;

const gracefulShutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  try {
    if (server) {
      await shutdownServer(server);
    }
  } catch (error) {
    logger.error('关闭 HTTP 服务器失败', error);
  }

  try {
    closeDatabase();
  } catch (error) {
    logger.error('关闭数据库失败', error);
  }

  process.exit(0);
};

const bootstrap = async (): Promise<void> => {
  try {
    // 先初始化数据库和DAO工厂，再加载 app（路由会依赖 DaoFactory）
    const db = getDatabase();
    initSchema(db);
    runMigrations(db);
    DaoFactory.initialize(db);

    const { createApp } = await import('./app');
    const app = createApp();
    const { restoreTaskSchedulers } = await import('./routes/api/tasks');

    server = createServer(app);
    await startServer(server);
    await restoreTaskSchedulers();

    process.on('SIGTERM', () => {
      void gracefulShutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void gracefulShutdown('SIGINT');
    });
  } catch (error) {
    logger.error('服务启动失败', error);
    process.exit(1);
  }
};

void bootstrap();
