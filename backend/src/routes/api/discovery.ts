import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { getDatabase } from '../../database/init';
import { DiscoveryCandidateDao, TargetDao } from '../../database/dao';
import { DiscoveryService } from '../../services/discovery/DiscoveryService';
import { DiscoveryRunRequest } from '../../types';

const router: Router = Router();
const db = getDatabase();
const candidateDao = new DiscoveryCandidateDao(db);
const targetDao = new TargetDao(db);
const service = new DiscoveryService(candidateDao, targetDao);

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

    const result = service.list({
      status: req.query['status'] as 'pending' | 'accepted' | 'rejected' | undefined,
      source: req.query['source'] ? String(req.query['source']) : undefined,
      minFinalScore,
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

export default router;
