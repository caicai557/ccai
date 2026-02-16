/**
 * 统计API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';
import { AccountDao } from '../../database/dao/AccountDao';
import { TaskDao } from '../../database/dao/TaskDao';
import { TaskExecutionDao, TaskExecution } from '../../database/dao/TaskExecutionDao';
import { LogDao } from '../../database/dao/LogDao';
import { TargetDao } from '../../database/dao/TargetDao';

const router: Router = Router();
const db = getDatabase();
const accountDao = new AccountDao(db);
const taskDao = new TaskDao(db);
const taskExecutionDao = new TaskExecutionDao(db);
const logDao = new LogDao(db);
const targetDao = new TargetDao(db);

/**
 * GET /api/stats/dashboard
 * 获取仪表板统计数据
 */
router.get(
  '/dashboard',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取仪表板统计数据');

    // 账号统计
    const accounts = accountDao.findAll();
    const onlineAccounts = accounts.filter((a) => a.status === 'online').length;
    const offlineAccounts = accounts.filter((a) => a.status === 'offline').length;
    const restrictedAccounts = accounts.filter((a) => a.status === 'restricted').length;

    // 任务统计
    const tasks = taskDao.findAll();
    const runningTasks = tasks.filter((t) => t.status === 'running').length;
    const stoppedTasks = tasks.filter((t) => t.status === 'stopped').length;

    // 目标统计
    const targets = targetDao.findAll();
    const activeTargets = targets.filter((target) => target.enabled).length;

    // 执行统计（今日）
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayExecutions = taskExecutionDao.findRecent(10000).filter((e) => {
      return new Date(e.executedAt) >= startOfToday;
    });

    const totalExecutions = todayExecutions.length;
    const successfulExecutions = todayExecutions.filter((e) => e.success).length;
    const failedExecutions = todayExecutions.filter((e) => !e.success).length;
    const successRate =
      totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(2) : '0';

    // 日志统计（最近24小时）
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const recentLogs = logDao.findByFilters({ startDate: oneDayAgo }, 10000, 0);

    const errorLogs = recentLogs.filter((l) => l.level === 'ERROR').length;
    const warnLogs = recentLogs.filter((l) => l.level === 'WARN').length;
    const infoLogs = recentLogs.filter((l) => l.level === 'INFO').length;

    res.json({
      success: true,
      data: {
        accounts: {
          total: accounts.length,
          online: onlineAccounts,
          offline: offlineAccounts,
          restricted: restrictedAccounts,
        },
        tasks: {
          total: tasks.length,
          running: runningTasks,
          stopped: stoppedTasks,
        },
        targets: {
          total: targets.length,
          active: activeTargets,
        },
        executions: {
          total: totalExecutions,
          successful: successfulExecutions,
          failed: failedExecutions,
          successRate: parseFloat(successRate),
        },
        logs: {
          total: recentLogs.length,
          error: errorLogs,
          warn: warnLogs,
          info: infoLogs,
        },
      },
    });
  })
);

/**
 * GET /api/stats/accounts
 * 获取账号统计
 */
router.get(
  '/accounts',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取账号统计');

    const accounts = accountDao.findAll();

    // 按状态分组
    const statusDistribution = {
      online: accounts.filter((a) => a.status === 'online').length,
      offline: accounts.filter((a) => a.status === 'offline').length,
      restricted: accounts.filter((a) => a.status === 'restricted').length,
    };

    // 按添加方式分组
    const addMethodDistribution = {
      phone: accounts.filter((a) => a.addMethod === 'phone').length,
      session: accounts.filter((a) => a.addMethod === 'session').length,
    };

    // 健康度统计
    const healthScores = accounts.map((a) => a.healthScore || 0);
    const avgHealthScore =
      healthScores.length > 0
        ? (healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length).toFixed(2)
        : '0';

    res.json({
      success: true,
      data: {
        total: accounts.length,
        statusDistribution,
        addMethodDistribution,
        avgHealthScore: parseFloat(avgHealthScore),
        accounts: accounts.map((a) => ({
          id: a.id,
          phoneNumber: a.phoneNumber,
          status: a.status,
          healthScore: a.healthScore,
          lastActiveAt: a.lastActive,
        })),
      },
    });
  })
);

/**
 * GET /api/stats/tasks
 * 获取任务统计
 */
router.get(
  '/tasks',
  asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.query;

    logger.info('获取任务统计');

    const tasks = taskDao.findAll();
    const daysNum = days ? parseInt(days as string, 10) : 7;

    // 按状态分组
    const statusDistribution = {
      running: tasks.filter((t) => t.status === 'running').length,
      stopped: tasks.filter((t) => t.status === 'stopped').length,
    };

    // 按类型分组
    const typeDistribution: Record<string, number> = {};
    tasks.forEach((t) => {
      const type = t.type || 'unknown';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // 执行统计
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    const recentExecutions = taskExecutionDao.findRecent(10000).filter((e) => {
      return new Date(e.executedAt) >= cutoffDate;
    });

    const executionsByTask: Record<string, { total: number; successful: number; failed: number }> =
      {};

    recentExecutions.forEach((e: TaskExecution) => {
      const taskId = e.taskId;
      if (!executionsByTask[taskId]) {
        executionsByTask[taskId] = { total: 0, successful: 0, failed: 0 };
      }
      executionsByTask[taskId]!.total++;
      if (e.success) {
        executionsByTask[taskId]!.successful++;
      } else {
        executionsByTask[taskId]!.failed++;
      }
    });

    res.json({
      success: true,
      data: {
        total: tasks.length,
        statusDistribution,
        typeDistribution,
        executionStats: {
          days: daysNum,
          totalExecutions: recentExecutions.length,
          byTask: executionsByTask,
        },
        tasks: tasks.map((t) => {
          const taskStats = executionsByTask[t.id] || { total: 0, successful: 0, failed: 0 };
          return {
            id: t.id,
            type: t.type,
            status: t.status,
            recentStats: taskStats,
          };
        }),
      },
    });
  })
);

/**
 * GET /api/stats/executions
 * 获取执行统计
 */
router.get(
  '/executions',
  asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.query;

    logger.info('获取执行统计');

    const daysNum = days ? parseInt(days as string, 10) : 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    const executions = taskExecutionDao.findRecent(10000).filter((e) => {
      return new Date(e.executedAt) >= cutoffDate;
    });

    // 按日期分组
    const executionsByDate: Record<string, { total: number; successful: number; failed: number }> =
      {};

    executions.forEach((e: TaskExecution) => {
      const date = new Date(e.executedAt).toISOString().split('T')[0];
      if (!date) return;

      if (!executionsByDate[date]) {
        executionsByDate[date] = { total: 0, successful: 0, failed: 0 };
      }
      executionsByDate[date]!.total++;
      if (e.success) {
        executionsByDate[date]!.successful++;
      } else {
        executionsByDate[date]!.failed++;
      }
    });

    // 按小时分组（最近24小时）
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const recentExecutions = executions.filter((e) => new Date(e.executedAt) >= oneDayAgo);

    const executionsByHour: Record<string, { total: number; successful: number; failed: number }> =
      {};

    recentExecutions.forEach((e: TaskExecution) => {
      const hour = new Date(e.executedAt).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      if (!hour) return;

      if (!executionsByHour[hour]) {
        executionsByHour[hour] = { total: 0, successful: 0, failed: 0 };
      }
      executionsByHour[hour]!.total++;
      if (e.success) {
        executionsByHour[hour]!.successful++;
      } else {
        executionsByHour[hour]!.failed++;
      }
    });

    res.json({
      success: true,
      data: {
        days: daysNum,
        total: executions.length,
        successful: executions.filter((e) => e.success).length,
        failed: executions.filter((e) => !e.success).length,
        byDate: executionsByDate,
        byHour: executionsByHour,
      },
    });
  })
);

export default router;
