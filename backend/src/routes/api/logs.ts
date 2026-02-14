/**
 * 日志管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { LogService } from '../../services/logger/LogService';
import { LogDao, LogFilters, LogLevel } from '../../database/dao/LogDao';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';

const router: Router = Router();
const db = getDatabase();
const logDao = new LogDao(db);
const logService = new LogService(logDao);

/**
 * GET /api/logs
 * 获取日志列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { level, accountId, taskId, startDate, endDate, limit, offset } = req.query;

    logger.info('获取日志列表');

    // 构建过滤条件
    const filters: LogFilters = {};

    if (level && typeof level === 'string') {
      filters.level = level as LogLevel;
    }

    if (accountId && typeof accountId === 'string') {
      filters.accountId = accountId;
    }

    if (taskId && typeof taskId === 'string') {
      filters.taskId = taskId;
    }

    if (startDate && typeof startDate === 'string') {
      filters.startDate = new Date(startDate);
    }

    if (endDate && typeof endDate === 'string') {
      filters.endDate = new Date(endDate);
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    const offsetNum = offset ? parseInt(offset as string, 10) : 0;

    const logs = logService.query(filters, limitNum, offsetNum);
    const total = logService.count(filters);

    res.json({
      success: true,
      data: {
        logs,
        total,
        limit: limitNum,
        offset: offsetNum,
      },
    });
  })
);

/**
 * GET /api/logs/recent
 * 获取最近的日志
 */
router.get(
  '/recent',
  asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.query;

    logger.info('获取最近日志');

    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    const logs = logService.getRecent(limitNum);

    res.json({
      success: true,
      data: {
        logs,
        total: logs.length,
      },
    });
  })
);

/**
 * GET /api/logs/export
 * 导出日志
 */
router.get(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    const { level, accountId, taskId, startDate, endDate, format } = req.query;

    logger.info('导出日志');

    // 构建过滤条件
    const filters: LogFilters = {};

    if (level && typeof level === 'string') {
      filters.level = level as LogLevel;
    }

    if (accountId && typeof accountId === 'string') {
      filters.accountId = accountId;
    }

    if (taskId && typeof taskId === 'string') {
      filters.taskId = taskId;
    }

    if (startDate && typeof startDate === 'string') {
      filters.startDate = new Date(startDate);
    }

    if (endDate && typeof endDate === 'string') {
      filters.endDate = new Date(endDate);
    }

    const exportFormat = format === 'csv' ? 'csv' : 'json';
    const content = logService.export(filters, exportFormat);

    // 设置响应头
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${timestamp}.${exportFormat}`;

    res.setHeader('Content-Type', exportFormat === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(content);
  })
);

/**
 * GET /api/logs/:id
 * 获取日志详情
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '日志ID不能为空');
    }

    logger.info(`获取日志详情: ${id}`);

    const log = logService.getById(id);

    if (!log) {
      throw new AppError(404, '日志不存在');
    }

    res.json({
      success: true,
      data: {
        log,
      },
    });
  })
);

/**
 * DELETE /api/logs/:id
 * 删除日志
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '日志ID不能为空');
    }

    logger.info(`删除日志: ${id}`);

    const deleted = logService.delete(id);

    if (!deleted) {
      throw new AppError(404, '日志不存在');
    }

    res.json({
      success: true,
      data: {
        message: '日志删除成功',
      },
    });
  })
);

/**
 * POST /api/logs/cleanup
 * 清理过期日志
 */
router.post(
  '/cleanup',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('清理过期日志');

    const deletedCount = logService.cleanup();

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `已清理 ${deletedCount} 条过期日志`,
      },
    });
  })
);

export default router;
