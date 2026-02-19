/**
 * API路由主入口
 */
import { Router } from 'express';
import accountsRouter from './accounts';
import targetsRouter from './targets';
import tasksRouter from './tasks';
import templatesRouter from './templates';
import logsRouter from './logs';
import statsRouter from './stats';
import configRouter from './config';

const router: Router = Router();

// 挂载路由
router.use('/accounts', accountsRouter);
router.use('/targets', targetsRouter);
router.use('/tasks', tasksRouter);
router.use('/templates', templatesRouter);
router.use('/logs', logsRouter);
router.use('/stats', statsRouter);
router.use('/config', configRouter);

// API根路径
router.get('/', (_req, res) => {
  res.json({
    message: 'Telegram自动化管理系统 API',
    version: '1.0.0',
    endpoints: {
      accounts: '/api/accounts',
      targets: '/api/targets',
      tasks: '/api/tasks',
      templates: '/api/templates',
      logs: '/api/logs',
      stats: '/api/stats',
      config: '/api/config',
    },
  });
});

export default router;
