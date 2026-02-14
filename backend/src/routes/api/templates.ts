/**
 * 模板管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { TemplateService } from '../../services/template/TemplateService';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../database/init';

const router: Router = Router();
const db = getDatabase();
const templateService = new TemplateService(db);

/**
 * POST /api/templates
 * 创建模板
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, content, weight } = req.body;

    if (!category || !content) {
      throw new AppError(400, '缺少必需参数');
    }

    logger.info(`创建模板: category=${category}`);

    const template = await templateService.createTemplate({
      category,
      content,
      weight,
    });

    res.json({
      success: true,
      data: {
        template,
        message: '模板创建成功',
      },
    });
  })
);

/**
 * GET /api/templates
 * 获取模板列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, enabled } = req.query;

    logger.info('获取模板列表');

    let templates;

    if (category) {
      if (category !== 'group_message' && category !== 'channel_comment') {
        throw new AppError(400, '无效的模板分类');
      }
      templates = await templateService.getTemplatesByCategory(
        category as 'group_message' | 'channel_comment'
      );
    } else if (enabled === 'true') {
      templates = await templateService.getEnabledTemplates();
    } else {
      templates = await templateService.getAllTemplates();
    }

    res.json({
      success: true,
      data: {
        templates,
        total: templates.length,
      },
    });
  })
);

/**
 * GET /api/templates/:id
 * 获取模板详情
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '模板ID不能为空');
    }

    logger.info(`获取模板详情: ${id}`);

    const template = await templateService.getTemplate(id);

    if (!template) {
      throw new AppError(404, '模板不存在');
    }

    // 获取使用计数
    const usageCount = await templateService.getUsageCount(id);

    res.json({
      success: true,
      data: {
        template: {
          ...template,
          usageCount,
        },
      },
    });
  })
);

/**
 * PUT /api/templates/:id
 * 更新模板
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { category, content, weight } = req.body;

    if (!id) {
      throw new AppError(400, '模板ID不能为空');
    }

    logger.info(`更新模板: ${id}`);

    const existingTemplate = await templateService.getTemplate(id);
    if (!existingTemplate) {
      throw new AppError(404, '模板不存在');
    }

    const template = await templateService.updateTemplate(id, {
      category,
      content,
      weight,
    });

    res.json({
      success: true,
      data: {
        template,
        message: '模板更新成功',
      },
    });
  })
);

/**
 * DELETE /api/templates/:id
 * 删除模板
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '模板ID不能为空');
    }

    logger.info(`删除模板: ${id}`);

    const template = await templateService.getTemplate(id);
    if (!template) {
      throw new AppError(404, '模板不存在');
    }

    await templateService.deleteTemplate(id);

    res.json({
      success: true,
      data: {
        message: '模板删除成功',
      },
    });
  })
);

/**
 * GET /api/templates/:id/preview
 * 预览模板
 */
router.get(
  '/:id/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '模板ID不能为空');
    }

    logger.info(`预览模板: ${id}`);

    const template = await templateService.getTemplate(id);
    if (!template) {
      throw new AppError(404, '模板不存在');
    }

    const previews = await templateService.previewTemplate(id);

    res.json({
      success: true,
      data: {
        previews,
        total: previews.length,
      },
    });
  })
);

/**
 * POST /api/templates/:id/generate
 * 生成模板内容
 */
router.post(
  '/:id/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '模板ID不能为空');
    }

    logger.info(`生成模板内容: ${id}`);

    const template = await templateService.getTemplate(id);
    if (!template) {
      throw new AppError(404, '模板不存在');
    }

    const content = await templateService.generateContent(id);

    res.json({
      success: true,
      data: {
        content,
      },
    });
  })
);

export default router;
