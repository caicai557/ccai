/**
 * 任务管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { TaskService } from '../../services/scheduler/TaskService';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';

const router: Router = Router();
const db = getDatabase();
const taskService = new TaskService(db);

/**
 * POST /api/tasks
 * 创建任务
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const taskDto = req.body;

    if (!taskDto.name || !taskDto.type) {
      throw new AppError(400, '缺少必需参数');
    }

    logger.info(`创建任务: ${taskDto.name}`);

    const task = await taskService.createTask(taskDto);

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
    const taskDto = req.body;

    if (!id) {
      throw new AppError(400, '任务ID不能为空');
    }

    logger.info(`更新任务: ${id}`);

    const existingTask = await taskService.getTask(id);
    if (!existingTask) {
      throw new AppError(404, '任务不存在');
    }

    const task = await taskService.updateTask(id, taskDto);

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

    await taskService.startTask(id);

    res.json({
      success: true,
      data: {
        message: '任务启动成功',
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
