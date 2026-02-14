/**
 * 配置管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { ConfigService, ConfigValidationError } from '../../services/config/ConfigService';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';

const router: Router = Router();
const db = getDatabase();
const configService = new ConfigService(db);

/**
 * GET /api/config
 * 获取配置
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取系统配置');

    const config = configService.getConfig();

    res.json({
      success: true,
      data: {
        config,
      },
    });
  })
);

/**
 * PUT /api/config
 * 更新配置
 */
router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const configUpdate = req.body;

    logger.info('更新系统配置');

    try {
      const config = configService.updateConfig(configUpdate);

      res.json({
        success: true,
        data: {
          config,
          message: '配置更新成功',
        },
      });
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw new AppError(400, error.message);
      }
      throw error;
    }
  })
);

/**
 * POST /api/config/reset
 * 重置配置
 */
router.post(
  '/reset',
  asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.body;

    logger.info('重置系统配置');

    let config;
    if (key) {
      // 重置特定配置项
      config = configService.resetConfigKey(key);
    } else {
      // 重置所有配置
      config = configService.resetConfig();
    }

    res.json({
      success: true,
      data: {
        config,
        message: key ? `配置项 ${key} 已重置` : '所有配置已重置',
      },
    });
  })
);

/**
 * GET /api/config/rateLimit
 * 获取速率限制配置
 */
router.get(
  '/rateLimit',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取速率限制配置');

    const config = configService.getRateLimitConfig();

    res.json({
      success: true,
      data: {
        config,
      },
    });
  })
);

/**
 * PUT /api/config/rateLimit
 * 更新速率限制配置
 */
router.put(
  '/rateLimit',
  asyncHandler(async (req: Request, res: Response) => {
    const configUpdate = req.body;

    logger.info('更新速率限制配置');

    try {
      const config = configService.updateRateLimitConfig(configUpdate);

      res.json({
        success: true,
        data: {
          config: config.rateLimit,
          message: '速率限制配置更新成功',
        },
      });
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw new AppError(400, error.message);
      }
      throw error;
    }
  })
);

/**
 * GET /api/config/log
 * 获取日志配置
 */
router.get(
  '/log',
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取日志配置');

    const config = configService.getLogConfig();

    res.json({
      success: true,
      data: {
        config,
      },
    });
  })
);

/**
 * PUT /api/config/log
 * 更新日志配置
 */
router.put(
  '/log',
  asyncHandler(async (req: Request, res: Response) => {
    const configUpdate = req.body;

    logger.info('更新日志配置');

    try {
      const config = configService.updateLogConfig(configUpdate);

      res.json({
        success: true,
        data: {
          config: config.log,
          message: '日志配置更新成功',
        },
      });
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw new AppError(400, error.message);
      }
      throw error;
    }
  })
);

export default router;
