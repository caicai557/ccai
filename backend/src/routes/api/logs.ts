/**
 * 日志管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { LogService } from '../../services/logger/LogService';
import { LogDao, LogEntry, LogFilters, LogLevel } from '../../database/dao/LogDao';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';
import fs from 'fs';
import path from 'path';

const router: Router = Router();
const db = getDatabase();
const logDao = new LogDao(db);
const logService = new LogService(logDao);

const LOG_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
const LOG_LINE_PATTERN = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+([A-Z]+):\s?(.*)$/;
const MAX_FILE_SCAN_LINES = 20000;

const normalizeLogLevel = (level: string): LogLevel | null => {
  const normalized = level.toUpperCase();
  return LOG_LEVELS.includes(normalized as LogLevel) ? (normalized as LogLevel) : null;
};

const normalizeLogTimestamp = (timestamp: string): string => {
  const maybeDate = new Date(timestamp.replace(' ', 'T'));
  return Number.isNaN(maybeDate.getTime()) ? new Date().toISOString() : maybeDate.toISOString();
};

const parseStructuredIds = (message: string): { accountId?: string; taskId?: string } => {
  const accountMatch = message.match(/\[账号:\s*([^\]]+)\]/);
  const taskMatch = message.match(/\[任务:\s*([^\]]+)\]/);
  return {
    accountId: accountMatch?.[1],
    taskId: taskMatch?.[1],
  };
};

const parseCombinedLogFile = (filePath: string): LogEntry[] => {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    return [];
  }

  const allLines = content.split(/\r?\n/);
  const lines = allLines.slice(Math.max(0, allLines.length - MAX_FILE_SCAN_LINES));
  const parsedLogs: LogEntry[] = [];
  let current: LogEntry | null = null;
  let lineNo = 0;

  for (const line of lines) {
    const matched = line.match(LOG_LINE_PATTERN);
    if (matched) {
      if (current) {
        parsedLogs.push(current);
      }

      const level = normalizeLogLevel(matched[2] || 'INFO') || 'INFO';
      const message = matched[3] || '';
      const structuredIds = parseStructuredIds(message);

      current = {
        id: `file-${Date.now()}-${lineNo}`,
        level,
        message,
        accountId: structuredIds.accountId,
        taskId: structuredIds.taskId,
        createdAt: normalizeLogTimestamp(matched[1] || ''),
      };
      lineNo += 1;
      continue;
    }

    if (current && line.trim()) {
      current.message = current.message ? `${current.message}\n${line}` : line;
    }
  }

  if (current) {
    parsedLogs.push(current);
  }

  return parsedLogs.reverse();
};

const filterAndPaginateFileLogs = (
  logs: LogEntry[],
  filters: LogFilters,
  limit: number,
  offset: number
): { logs: LogEntry[]; total: number } => {
  const filtered = logs.filter((log) => {
    if (filters.level && log.level !== filters.level) {
      return false;
    }
    if (filters.accountId && log.accountId !== filters.accountId) {
      return false;
    }
    if (filters.taskId && log.taskId !== filters.taskId) {
      return false;
    }

    const createdAt = new Date(log.createdAt);
    if (filters.startDate && createdAt < filters.startDate) {
      return false;
    }
    if (filters.endDate && createdAt > filters.endDate) {
      return false;
    }

    return true;
  });

  return {
    logs: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
};

const queryLogsWithFallback = (
  filters: LogFilters,
  limit: number,
  offset: number
): { logs: LogEntry[]; total: number; source: 'db' | 'file' } => {
  const dbLogs = logService.query(filters, limit, offset);
  const dbTotal = logService.count(filters);

  if (dbTotal > 0 || dbLogs.length > 0) {
    return {
      logs: dbLogs,
      total: dbTotal,
      source: 'db',
    };
  }

  const logFilePath = path.join(process.cwd(), 'logs', 'combined.log');
  const fileLogs = parseCombinedLogFile(logFilePath);
  const fallback = filterAndPaginateFileLogs(fileLogs, filters, limit, offset);

  return {
    logs: fallback.logs,
    total: fallback.total,
    source: 'file',
  };
};

const parseDateQuery = (raw: unknown, label: string): Date | undefined => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${label} 参数无效`);
  }
  return parsed;
};

const parseIntQuery = (
  raw: unknown,
  options: { label: string; defaultValue: number; min: number; max: number }
): number => {
  const value =
    typeof raw === 'string' && raw.trim().length > 0 ? Number.parseInt(raw, 10) : options.defaultValue;
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    throw new AppError(400, `${options.label} 参数无效`);
  }
  return value;
};

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
      const normalizedLevel = normalizeLogLevel(level);
      if (!normalizedLevel) {
        throw new AppError(400, '日志级别无效');
      }
      filters.level = normalizedLevel;
    }

    if (accountId && typeof accountId === 'string') {
      filters.accountId = accountId;
    }

    if (taskId && typeof taskId === 'string') {
      filters.taskId = taskId;
    }

    filters.startDate = parseDateQuery(startDate, 'startDate');
    filters.endDate = parseDateQuery(endDate, 'endDate');
    if (filters.startDate && filters.endDate && filters.endDate < filters.startDate) {
      throw new AppError(400, 'endDate 不能早于 startDate');
    }
    const limitNum = parseIntQuery(limit, { label: 'limit', defaultValue: 100, min: 1, max: 500 });
    const offsetNum = parseIntQuery(offset, { label: 'offset', defaultValue: 0, min: 0, max: 1000000 });

    const result = queryLogsWithFallback(filters, limitNum, offsetNum);
    const logs = result.logs;
    const total = result.total;

    res.json({
      success: true,
      data: {
        logs,
        total,
        limit: limitNum,
        offset: offsetNum,
        source: result.source,
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

    const limitNum = parseIntQuery(limit, { label: 'limit', defaultValue: 100, min: 1, max: 500 });
    const result = queryLogsWithFallback({}, limitNum, 0);
    const logs = result.logs;

    res.json({
      success: true,
      data: {
        logs,
        total: logs.length,
        source: result.source,
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
      const normalizedLevel = normalizeLogLevel(level);
      if (!normalizedLevel) {
        throw new AppError(400, '日志级别无效');
      }
      filters.level = normalizedLevel;
    }

    if (accountId && typeof accountId === 'string') {
      filters.accountId = accountId;
    }

    if (taskId && typeof taskId === 'string') {
      filters.taskId = taskId;
    }

    filters.startDate = parseDateQuery(startDate, 'startDate');
    filters.endDate = parseDateQuery(endDate, 'endDate');
    if (filters.startDate && filters.endDate && filters.endDate < filters.startDate) {
      throw new AppError(400, 'endDate 不能早于 startDate');
    }

    const exportFormat = format === 'csv' ? 'csv' : 'json';
    const result = queryLogsWithFallback(filters, 10000, 0);
    const content =
      exportFormat === 'csv'
        ? (() => {
            if (result.logs.length === 0) {
              return '';
            }
            const headers = ['ID', '级别', '消息', '账号ID', '任务ID', '详情', '创建时间'];
            const rows = [headers.join(',')];
            for (const log of result.logs) {
              const escapedMessage =
                log.message.includes(',') || log.message.includes('"') || log.message.includes('\n')
                  ? `"${log.message.replace(/"/g, '""')}"`
                  : log.message;
              rows.push(
                [
                  log.id,
                  log.level,
                  escapedMessage,
                  log.accountId || '',
                  log.taskId || '',
                  log.details || '',
                  log.createdAt,
                ].join(',')
              );
            }
            return rows.join('\n');
          })()
        : JSON.stringify(result.logs, null, 2);

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
