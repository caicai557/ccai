/**
 * 目标管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { TargetDao } from '../../database/dao/TargetDao';
import { getDatabase } from '../../database/init';
import { logger } from '../../utils/logger';

const router: Router = Router();
const db = getDatabase();
const targetDao = new TargetDao(db);

/**
 * POST /api/targets
 * 添加群组/频道
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { type, telegramId, title } = req.body;

    if (!type || !telegramId || !title) {
      throw new AppError(400, '缺少必需参数');
    }

    if (type !== 'group' && type !== 'channel') {
      throw new AppError(400, '类型必须是 group 或 channel');
    }

    logger.info(`添加目标: ${title} (${type})`);

    const target = targetDao.create({
      type,
      telegramId,
      title,
      enabled: true,
    });

    res.json({
      success: true,
      data: {
        target,
        message: '目标添加成功',
      },
    });
  })
);

/**
 * GET /api/targets
 * 获取目标列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { type, enabled } = req.query;

    logger.info('获取目标列表');

    let targets;

    if (type) {
      if (type !== 'group' && type !== 'channel') {
        throw new AppError(400, '类型必须是 group 或 channel');
      }
      targets = targetDao.findByType(type as 'group' | 'channel');
    } else if (enabled === 'true') {
      targets = targetDao.findEnabled();
    } else {
      targets = targetDao.findAll();
    }

    res.json({
      success: true,
      data: {
        targets,
        total: targets.length,
      },
    });
  })
);

/**
 * GET /api/targets/:id
 * 获取目标详情
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '目标ID不能为空');
    }

    logger.info(`获取目标详情: ${id}`);

    const target = targetDao.findById(id);

    if (!target) {
      throw new AppError(404, '目标不存在');
    }

    res.json({
      success: true,
      data: {
        target,
      },
    });
  })
);

/**
 * PUT /api/targets/:id
 * 更新目标
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, enabled } = req.body;

    if (!id) {
      throw new AppError(400, '目标ID不能为空');
    }

    logger.info(`更新目标: ${id}`);

    const existingTarget = targetDao.findById(id);
    if (!existingTarget) {
      throw new AppError(404, '目标不存在');
    }

    const target = targetDao.update(id, {
      title,
      enabled,
    });

    res.json({
      success: true,
      data: {
        target,
        message: '目标更新成功',
      },
    });
  })
);

/**
 * DELETE /api/targets/:id
 * 删除目标
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '目标ID不能为空');
    }

    logger.info(`删除目标: ${id}`);

    const target = targetDao.findById(id);
    if (!target) {
      throw new AppError(404, '目标不存在');
    }

    const deleted = targetDao.delete(id);

    if (!deleted) {
      throw new AppError(500, '删除目标失败');
    }

    res.json({
      success: true,
      data: {
        message: '目标删除成功',
      },
    });
  })
);

export default router;
