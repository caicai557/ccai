/**
 * 统计API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';
import { AccountDao } from '../../database/dao/AccountDao';
import { TaskDao } from '../../database/dao/TaskDao';
import { TargetDao } from '../../database/dao/TargetDao';

const router: Router = Router();
const db = getDatabase();
const accountDao = new AccountDao(db);
const taskDao = new TaskDao(db);
const targetDao = new TargetDao(db);

const normalizeDays = (raw: unknown, fallback: number = 7): number => {
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 90);
};

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

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const executionSummary = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
          FROM task_executions
          WHERE executed_at >= ?
        `
      )
      .get(startOfToday.toISOString()) as {
      total: number | null;
      successful: number | null;
      failed: number | null;
    };

    const totalExecutions = Number(executionSummary.total || 0);
    const successfulExecutions = Number(executionSummary.successful || 0);
    const failedExecutions = Number(executionSummary.failed || 0);
    const successRate =
      totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(2) : '0';

    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const logSummary = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) AS errorCount,
            SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END) AS warnCount,
            SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) AS infoCount
          FROM logs
          WHERE created_at >= ?
        `
      )
      .get(oneDayAgo.toISOString()) as {
      total: number | null;
      errorCount: number | null;
      warnCount: number | null;
      infoCount: number | null;
    };

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
          total: Number(logSummary.total || 0),
          error: Number(logSummary.errorCount || 0),
          warn: Number(logSummary.warnCount || 0),
          info: Number(logSummary.infoCount || 0),
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
    const daysNum = normalizeDays(days);

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
    const executionRows = db
      .prepare(
        `
          SELECT
            task_id AS taskId,
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
          FROM task_executions
          WHERE executed_at >= ?
          GROUP BY task_id
        `
      )
      .all(cutoffDate.toISOString()) as Array<{
      taskId: string;
      total: number | null;
      successful: number | null;
      failed: number | null;
    }>;

    const executionsByTask: Record<string, { total: number; successful: number; failed: number }> =
      {};
    let totalExecutions = 0;
    executionRows.forEach((row) => {
      const stats = {
        total: Number(row.total || 0),
        successful: Number(row.successful || 0),
        failed: Number(row.failed || 0),
      };
      executionsByTask[row.taskId] = stats;
      totalExecutions += stats.total;
    });

    res.json({
      success: true,
      data: {
        total: tasks.length,
        statusDistribution,
        typeDistribution,
        executionStats: {
          days: daysNum,
          totalExecutions,
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

    const daysNum = normalizeDays(days);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    const summary = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
          FROM task_executions
          WHERE executed_at >= ?
        `
      )
      .get(cutoffDate.toISOString()) as {
      total: number | null;
      successful: number | null;
      failed: number | null;
    };

    const byDateRows = db
      .prepare(
        `
          SELECT
            substr(executed_at, 1, 10) AS day,
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
          FROM task_executions
          WHERE executed_at >= ?
          GROUP BY day
          ORDER BY day ASC
        `
      )
      .all(cutoffDate.toISOString()) as Array<{
      day: string | null;
      total: number | null;
      successful: number | null;
      failed: number | null;
    }>;
    const executionsByDate: Record<string, { total: number; successful: number; failed: number }> = {};
    byDateRows.forEach((row) => {
      if (!row.day) {
        return;
      }
      executionsByDate[row.day] = {
        total: Number(row.total || 0),
        successful: Number(row.successful || 0),
        failed: Number(row.failed || 0),
      };
    });

    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const byHourRows = db
      .prepare(
        `
          SELECT
            substr(executed_at, 1, 13) AS hour,
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
          FROM task_executions
          WHERE executed_at >= ?
          GROUP BY hour
          ORDER BY hour ASC
        `
      )
      .all(oneDayAgo.toISOString()) as Array<{
      hour: string | null;
      total: number | null;
      successful: number | null;
      failed: number | null;
    }>;
    const executionsByHour: Record<string, { total: number; successful: number; failed: number }> = {};
    byHourRows.forEach((row) => {
      if (!row.hour) {
        return;
      }
      executionsByHour[row.hour] = {
        total: Number(row.total || 0),
        successful: Number(row.successful || 0),
        failed: Number(row.failed || 0),
      };
    });

    res.json({
      success: true,
      data: {
        days: daysNum,
        total: Number(summary.total || 0),
        successful: Number(summary.successful || 0),
        failed: Number(summary.failed || 0),
        byDate: executionsByDate,
        byHour: executionsByHour,
      },
    });
  })
);

export default router;
