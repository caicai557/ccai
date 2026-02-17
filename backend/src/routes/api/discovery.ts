import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { getDatabase } from '../../database/init';
import {
  AccountDao,
  DiscoveryCandidateDao,
  DiscoveryKeywordDao,
  DiscoveryRunDao,
  IndexSourceDao,
  TaskDraftDao,
  TemplateDao,
  TargetDao,
} from '../../database/dao';
import { DiscoveryService } from '../../services/discovery/DiscoveryService';
import { TaskService } from '../../services/scheduler/TaskService';
import { TaskDraftService } from '../../services/scheduler/TaskDraftService';
import { getDiscoveryConfig } from '../../config';
import { ConfirmTaskDraftDto, CreateTaskDraftDto, DiscoveryRunRequest, DiscoverySourceType } from '../../types';

const router: Router = Router();
const db = getDatabase();
const cfg = getDiscoveryConfig();
const candidateDao = new DiscoveryCandidateDao(db);
const targetDao = new TargetDao(db);
const indexSourceDao = new IndexSourceDao(db);
const keywordDao = new DiscoveryKeywordDao(db);
const runDao = new DiscoveryRunDao(db);
const taskDraftDao = new TaskDraftDao(db);
const templateDao = new TemplateDao(db);
const accountDao = new AccountDao(db);
const taskService = new TaskService(db);

const service = new DiscoveryService(candidateDao, targetDao, {
  indexSourceDao,
  keywordDao,
  runDao,
});
const taskDraftService = new TaskDraftService(
  taskDraftDao,
  candidateDao,
  targetDao,
  templateDao,
  accountDao,
  taskService
);

const mapTaskDraftError = (error: unknown): AppError => {
  const message = error instanceof Error ? error.message : '任务草稿操作失败';

  if (
    message.includes('不存在') ||
    message.includes('不能为空') ||
    message.includes('仅') ||
    message.includes('缺少可用模板') ||
    message.includes('草稿可用账号为空') ||
    message.includes('模板类型与任务类型不匹配') ||
    message.includes('模板已禁用') ||
    message.includes('状态冲突') ||
    message.includes('候选')
  ) {
    if (message.includes('不存在')) {
      return new AppError(404, message);
    }
    return new AppError(400, message);
  }

  return new AppError(500, message);
};

router.post(
  '/run',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as DiscoveryRunRequest;

    if (!payload.accountId) {
      throw new AppError(400, 'accountId 不能为空');
    }

    const result = await service.run(payload);
    res.json({ success: true, data: result });
  })
);

router.get(
  '/candidates',
  asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query['page'] || 1);
    const pageSize = Number(req.query['pageSize'] || 20);
    const minFinalScore = req.query['minFinalScore']
      ? Number(req.query['minFinalScore'])
      : undefined;
    const qualityScoreMin = req.query['qualityScoreMin']
      ? Number(req.query['qualityScoreMin'])
      : undefined;
    const sortByRaw = req.query['sortBy'] ? String(req.query['sortBy']) : undefined;
    const sortBy = sortByRaw === 'qualityScore' ? 'qualityScore' : 'createdAt';

    const result = service.list({
      status: req.query['status'] as 'pending' | 'accepted' | 'rejected' | undefined,
      source: req.query['source'] ? String(req.query['source']) : undefined,
      sourceType: req.query['sourceType']
        ? (String(req.query['sourceType']) as DiscoverySourceType)
        : undefined,
      runId: req.query['runId'] ? String(req.query['runId']) : undefined,
      regionProfile: req.query['regionProfile'] ? String(req.query['regionProfile']) : undefined,
      indexBotUsername: req.query['indexBotUsername']
        ? String(req.query['indexBotUsername'])
        : undefined,
      minFinalScore,
      qualityScoreMin,
      sortBy,
      page,
      pageSize,
    });

    res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
      },
    });
  })
);

router.get(
  '/index-sources',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = service.listIndexSources();

    res.json({
      success: true,
      data: {
        items,
        total: items.length,
      },
    });
  })
);

router.get(
  '/keywords',
  asyncHandler(async (req: Request, res: Response) => {
    const profile = req.query['profile'] ? String(req.query['profile']) : undefined;
    const items = service.listKeywords(profile);

    res.json({
      success: true,
      data: {
        profile: (profile || 'manila').trim().toLowerCase() || 'manila',
        items,
        total: items.length,
      },
    });
  })
);

router.post(
  '/accept',
  asyncHandler(async (req: Request, res: Response) => {
    const candidateIds = Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [];
    if (candidateIds.length === 0) {
      throw new AppError(400, 'candidateIds 不能为空');
    }

    const result = service.accept(candidateIds.map((id: unknown) => String(id)));

    res.json({
      success: true,
      data: {
        ...result,
        summary: {
          created: result.created.length,
          duplicated: result.duplicated.length,
          failed: result.failed.length,
        },
      },
    });
  })
);

router.post(
  '/task-drafts',
  asyncHandler(async (req: Request, res: Response) => {
    if (!cfg.taskDraftsEnabled) {
      throw new AppError(403, '任务草稿功能未开启');
    }

    const payload = req.body as CreateTaskDraftDto;
    if (!Array.isArray(payload?.candidateIds) || payload.candidateIds.length === 0) {
      throw new AppError(400, 'candidateIds 不能为空');
    }

    let result;
    try {
      result = taskDraftService.createDrafts({
        candidateIds: payload.candidateIds.map((item) => String(item)),
        accountIds: Array.isArray(payload.accountIds)
          ? payload.accountIds.map((item) => String(item))
          : undefined,
        templateId: payload.templateId ? String(payload.templateId) : undefined,
        priority: payload.priority,
      });
    } catch (error) {
      throw mapTaskDraftError(error);
    }

    res.json({
      success: true,
      data: {
        ...result,
        summary: {
          created: result.created.length,
          duplicated: result.duplicated.length,
          failed: result.failed.length,
        },
      },
    });
  })
);

router.get(
  '/task-drafts',
  asyncHandler(async (req: Request, res: Response) => {
    if (!cfg.taskDraftsEnabled) {
      throw new AppError(403, '任务草稿功能未开启');
    }

    const page = Number(req.query['page'] || 1);
    const pageSize = Number(req.query['pageSize'] || 20);
    const statusRaw = req.query['status'] ? String(req.query['status']) : undefined;
    const status =
      statusRaw && ['pending', 'confirmed', 'rejected'].includes(statusRaw)
        ? (statusRaw as 'pending' | 'confirmed' | 'rejected')
        : undefined;

    const result = taskDraftService.list({
      status,
      runId: req.query['runId'] ? String(req.query['runId']) : undefined,
      sourceType: req.query['sourceType']
        ? (String(req.query['sourceType']) as DiscoverySourceType)
        : undefined,
      page,
      pageSize,
    });

    res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
      },
    });
  })
);

router.get(
  '/task-drafts/stats',
  asyncHandler(async (req: Request, res: Response) => {
    if (!cfg.taskDraftsEnabled) {
      throw new AppError(403, '任务草稿功能未开启');
    }

    const days = Number(req.query['days'] || 7);
    const daily = taskDraftService.getDailyStats(days);
    const sourceRejected = taskDraftService.getSourceFailureStats(days);

    res.json({
      success: true,
      data: {
        days,
        daily,
        sourceRejected,
      },
    });
  })
);

router.post(
  '/task-drafts/:id/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    if (!cfg.taskDraftsEnabled) {
      throw new AppError(403, '任务草稿功能未开启');
    }

    const { id } = req.params;
    if (!id) {
      throw new AppError(400, '草稿ID不能为空');
    }

    const payload = req.body as ConfirmTaskDraftDto;
    let result;
    try {
      result = await taskDraftService.confirmDraft(id, {
        accountIds: Array.isArray(payload.accountIds)
          ? payload.accountIds.map((item) => String(item))
          : undefined,
        templateId: payload.templateId ? String(payload.templateId) : undefined,
        config: payload.config,
        priority: payload.priority,
      });
    } catch (error) {
      throw mapTaskDraftError(error);
    }

    res.json({
      success: true,
      data: {
        draft: result.draft,
        task: result.task,
      },
    });
  })
);

router.post(
  '/task-drafts/:id/reject',
  asyncHandler(async (req: Request, res: Response) => {
    if (!cfg.taskDraftsEnabled) {
      throw new AppError(403, '任务草稿功能未开启');
    }

    const { id } = req.params;
    if (!id) {
      throw new AppError(400, '草稿ID不能为空');
    }

    const reason = req.body?.reason ? String(req.body.reason) : undefined;
    let draft;
    try {
      draft = taskDraftService.rejectDraft(id, reason);
    } catch (error) {
      throw mapTaskDraftError(error);
    }

    res.json({
      success: true,
      data: {
        draft,
      },
    });
  })
);

export default router;
