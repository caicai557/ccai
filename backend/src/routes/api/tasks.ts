/**
 * 任务管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { TaskService } from '../../services/scheduler/TaskService';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';
import { CreateTaskDto, Task } from '../../types/task';

const router: Router = Router();
const db = getDatabase();
const taskService = new TaskService(db);

export const restoreTaskSchedulers = async (): Promise<void> => {
  await taskService.restoreRunningTasks();
};

const parseArrayField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter((item) => item.length > 0);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter((item) => item.length > 0);
      }
    } catch {
      return [];
    }
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const normalizeTaskPayload = (
  rawPayload: Record<string, unknown>,
  existingTask?: Task
): Record<string, unknown> => {
  const hasAccountField =
    Object.prototype.hasOwnProperty.call(rawPayload, 'accountIds') ||
    Object.prototype.hasOwnProperty.call(rawPayload, 'accountId');
  const hasTargetField =
    Object.prototype.hasOwnProperty.call(rawPayload, 'targetIds') ||
    Object.prototype.hasOwnProperty.call(rawPayload, 'targetId');

  let accountIds: string[] | undefined;
  if (hasAccountField) {
    const arrayValue = parseArrayField(rawPayload['accountIds']);
    if (arrayValue.length > 0) {
      accountIds = arrayValue;
    } else if (typeof rawPayload['accountId'] === 'string' && rawPayload['accountId'].trim()) {
      accountIds = [rawPayload['accountId'].trim()];
    } else {
      accountIds = [];
    }
  }

  let targetIds: string[] | undefined;
  if (hasTargetField) {
    const arrayValue = parseArrayField(rawPayload['targetIds']);
    if (arrayValue.length > 0) {
      targetIds = arrayValue;
    } else if (typeof rawPayload['targetId'] === 'string' && rawPayload['targetId'].trim()) {
      targetIds = [rawPayload['targetId'].trim()];
    } else {
      targetIds = [];
    }
  }

  const rawConfig = rawPayload['config'];
  const configFromPayload =
    rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
      ? ({ ...(rawConfig as Record<string, unknown>) } as Record<string, unknown>)
      : undefined;
  let normalizedConfig = configFromPayload;

  const trimmedTemplateId =
    typeof rawPayload['templateId'] === 'string' ? rawPayload['templateId'].trim() : '';
  if (trimmedTemplateId) {
    normalizedConfig = normalizedConfig || ({ ...(existingTask?.config || {}) } as Record<string, unknown>);
    normalizedConfig['templateId'] = trimmedTemplateId;
  }

  const trimmedName = typeof rawPayload['name'] === 'string' ? rawPayload['name'].trim() : '';
  if (trimmedName) {
    normalizedConfig = normalizedConfig || ({ ...(existingTask?.config || {}) } as Record<string, unknown>);
    normalizedConfig['name'] = trimmedName;
  }

  if (existingTask && (hasAccountField || hasTargetField)) {
    normalizedConfig = normalizedConfig || ({ ...(existingTask.config || {}) } as Record<string, unknown>);
    delete normalizedConfig['dispatchState'];
  }

  const normalizedPayload: Record<string, unknown> = {
    ...rawPayload,
  };

  if (accountIds !== undefined) {
    normalizedPayload['accountIds'] = accountIds;
  }
  if (targetIds !== undefined) {
    normalizedPayload['targetIds'] = targetIds;
  }
  if (normalizedConfig !== undefined) {
    normalizedPayload['config'] = normalizedConfig;
  }

  return normalizedPayload;
};

const mapTaskErrorToAppError = (error: unknown): AppError => {
  const message = error instanceof Error ? error.message : '任务操作失败';

  if (
    message.includes('任务预检失败') ||
    message.includes('不能为空') ||
    message.includes('格式无效') ||
    message.includes('无可用账号-目标组合') ||
    message.includes('strict策略') ||
    message.includes('无法更新') ||
    message.includes('发送间隔不能少于10分钟')
  ) {
    return new AppError(400, message);
  }

  return new AppError(500, message);
};

/**
 * POST /api/tasks
 * 创建任务
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const taskDto = normalizeTaskPayload(req.body || {}) as unknown as CreateTaskDto;

    if (!taskDto.type) {
      throw new AppError(400, '缺少必需参数');
    }

    const taskName =
      taskDto.config && typeof taskDto.config === 'object'
        ? ((taskDto.config as unknown as Record<string, unknown>)['name'] as string | undefined)
        : undefined;
    logger.info(`创建任务: ${taskName || taskDto.type}`);

    const task = await taskService.createTask(taskDto).catch((error) => {
      throw mapTaskErrorToAppError(error);
    });

    res.json({
      success: true,
      data: {
        task,
        message: '任务创建成功',
      },
    });
  })
);

/**
 * GET /api/tasks
 * 获取任务列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, accountId } = req.query;

    logger.info('获取任务列表');

    let tasks;

    if (status && (status === 'running' || status === 'stopped')) {
      tasks = await taskService.getTasksByStatus(status);
    } else if (accountId && typeof accountId === 'string') {
      tasks = await taskService.getTasksByAccountId(accountId);
    } else {
      tasks = await taskService.getAllTasks();
    }

    res.json({
      success: true,
      data: {
        tasks,
        total: tasks.length,
      },
    });
  })
);

/**
 * GET /api/tasks/:id
 * 获取任务详情
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`获取任务详情: ${id}`);

    const task = await taskService.getTask(id);

    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    // 获取任务统计信息
    const stats = taskService.getTaskStats(id);

    res.json({
      success: true,
      data: {
        task,
        stats,
      },
    });
  })
);

/**
 * PUT /api/tasks/:id
 * 更新任务
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const rawTaskDto = req.body;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`更新任务: ${id}`);

    const existingTask = await taskService.getTask(id);
    if (!existingTask) {
      throw new AppError(404, '任务不存在');
    }

    const taskDto = normalizeTaskPayload(rawTaskDto || {}, existingTask) as Partial<CreateTaskDto>;

    const task = await taskService.updateTask(id, taskDto).catch((error) => {
      throw mapTaskErrorToAppError(error);
    });

    res.json({
      success: true,
      data: {
        task,
        message: '任务更新成功',
      },
    });
  })
);

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`删除任务: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    await taskService.deleteTask(id);

    res.json({
      success: true,
      data: {
        message: '任务删除成功',
      },
    });
  })
);

/**
 * POST /api/tasks/:id/start
 * 启动任务
 */
router.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`启动任务: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    const startResult = await taskService.startTask(id).catch((error) => {
      throw mapTaskErrorToAppError(error);
    });

    res.json({
      success: true,
      data: {
        message: startResult.message,
        precheck: startResult.precheck,
      },
    });
  })
);

/**
 * POST /api/tasks/:id/stop
 * 停止任务
 */
router.post(
  '/:id/stop',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`停止任务: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    await taskService.stopTask(id);

    res.json({
      success: true,
      data: {
        message: '任务停止成功',
      },
    });
  })
);

/**
 * POST /api/tasks/:id/pause
 * 暂停任务
 */
router.post(
  '/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`暂停任务: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    await taskService.pauseTask(id);

    res.json({
      success: true,
      data: {
        message: '任务暂停成功',
      },
    });
  })
);

/**
 * GET /api/tasks/:id/history
 * 获取执行历史
 */
router.get(
  '/:id/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { limit } = req.query;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`获取任务执行历史: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const history = await taskService.getTaskHistory(id, limitNum);

    res.json({
      success: true,
      data: {
        history,
        total: history.length,
      },
    });
  })
);

/**
 * GET /api/tasks/:id/stats
 * 获取任务统计信息
 */
router.get(
  '/:id/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { days } = req.query;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`获取任务统计信息: ${id}`);

    const task = await taskService.getTask(id);
    if (!task) {
      throw new AppError(404, '任务不存在');
    }

    const daysNum = days ? parseInt(days as string, 10) : 7;
    const stats = await taskService.getTaskExecutionStats(id, daysNum);

    res.json({
      success: true,
      data: stats,
    });
  })
);

export default router;
