/**
 * 账号管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { AccountService } from '../../services/AccountService';
import { logger } from '../../utils/logger';
import multer from 'multer';
import { AccountPoolStatus, AccountProfileBatchJobStatus } from '../../types';
import { AccountProfileBatchService } from '../../services/account/AccountProfileBatchService';

const router: Router = Router();
const accountService = new AccountService();
const accountProfileBatchService = new AccountProfileBatchService();
const poolStatuses: AccountPoolStatus[] = ['ok', 'error', 'banned', 'cooldown'];
const profileJobStatuses: AccountProfileBatchJobStatus[] = [
  'pending',
  'running',
  'completed',
  'cancelled',
  'failed',
];

const mapAccountErrorToAppError = (error: unknown): AppError => {
  const message = error instanceof Error ? error.message : '账号操作失败';

  if (
    message.includes('手机号') ||
    message.includes('账号不存在') ||
    message.includes('客户端不存在') ||
    message.includes('SESSION_PASSWORD_NEEDED') ||
    message.includes('该手机号已添加') ||
    message.includes('Telegram API配置缺失') ||
    message.includes('TELEGRAM_API_ID') ||
    message.includes('TELEGRAM_API_HASH') ||
    message.includes('会话文件内容为空') ||
    message.includes('无效的会话文件格式') ||
    message.includes('会话已失效或无效') ||
    message.includes('无法从会话中获取手机号') ||
    message.includes('只支持.session文件')
  ) {
    return new AppError(400, message);
  }

  return new AppError(500, message);
};

// 配置文件上传
const sessionUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.session')) {
      cb(null, true);
    } else {
      cb(new Error('只支持.session文件'));
    }
  },
});

const profileBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 20,
  },
});

const parseArrayField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
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
        return parsed
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0);
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

/**
 * POST /api/accounts/phone
 * 手机号登录（发送验证码）
 */
router.post(
  '/phone',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      throw new AppError(400, '手机号不能为空');
    }

    logger.info(`开始添加账号: ${phoneNumber}`);

    let result;
    try {
      result = await accountService.addAccount(phoneNumber);
    } catch (error) {
      throw mapAccountErrorToAppError(error);
    }

    res.json({
      success: true,
      data: {
        accountId: result.accountId,
        phoneCodeHash: result.phoneCodeHash,
        message: '验证码已发送，请查收',
      },
    });
  })
);

/**
 * POST /api/accounts/verify
 * 提交验证码
 */
router.post(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { accountId, code, phoneCodeHash, password } = req.body;

    if (!accountId || !code || !phoneCodeHash) {
      throw new AppError(400, '缺少必需参数');
    }

    logger.info(`验证账号: ${accountId}`);

    try {
      // 先验证验证码
      await accountService.verifyCode(accountId, code, phoneCodeHash);

      // 如果提供了密码，验证两步验证
      if (password) {
        await accountService.verifyPassword(accountId, password);
      }

      // 获取账号信息
      const account = await accountService.getAccount(accountId);

      res.json({
        success: true,
        data: {
          account,
          message: '账号验证成功',
        },
      });
    } catch (error) {
      throw mapAccountErrorToAppError(error);
    }
  })
);

/**
 * POST /api/accounts/verify-password
 * 提交两步验证密码
 */
router.post(
  '/verify-password',
  asyncHandler(async (req: Request, res: Response) => {
    const { accountId, password } = req.body;

    if (!accountId || !password) {
      throw new AppError(400, '缺少必需参数');
    }

    logger.info(`验证账号两步密码: ${accountId}`);

    try {
      await accountService.verifyPassword(accountId, password);

      const account = await accountService.getAccount(accountId);

      res.json({
        success: true,
        data: {
          account,
          message: '两步验证成功',
        },
      });
    } catch (error) {
      throw mapAccountErrorToAppError(error);
    }
  })
);

/**
 * POST /api/accounts/import
 * 导入会话文件
 */
router.post(
  '/import',
  sessionUpload.single('sessionFile'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, '请上传会话文件');
    }

    logger.info(`导入会话文件: ${req.file.originalname}`);

    let account;
    try {
      account = await accountService.importAccountFromSession(
        req.file.buffer,
        req.file.originalname
      );
    } catch (error) {
      throw mapAccountErrorToAppError(error);
    }

    res.json({
      success: true,
      data: {
        account,
        message: '会话文件导入成功',
      },
    });
  })
);

/**
 * GET /api/accounts
 * 获取账号列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('获取账号列表');

    const poolStatusRaw = req.query['poolStatus'];
    const poolStatus =
      typeof poolStatusRaw === 'string' && poolStatusRaw.trim()
        ? (poolStatusRaw.trim() as AccountPoolStatus)
        : undefined;

    if (poolStatus && !poolStatuses.includes(poolStatus)) {
      throw new AppError(400, 'poolStatus 参数无效');
    }

    const accounts = await accountService.getAllAccounts(poolStatus);

    res.json({
      success: true,
      data: {
        accounts,
        total: accounts.length,
      },
    });
  })
);

/**
 * POST /api/accounts/profile-batch/jobs
 * 创建账号资料批量修改任务
 */
router.post(
  '/profile-batch/jobs',
  profileBatchUpload.array('avatarFiles', 20),
  asyncHandler(async (req: Request, res: Response) => {
    const files = ((req.files as Express.Multer.File[] | undefined) || []).map((file) => ({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    }));

    const accountIds = parseArrayField(req.body?.accountIds);
    const retryLimit = req.body?.retryLimit !== undefined ? Number(req.body.retryLimit) : undefined;

    try {
      const job = await accountProfileBatchService.createJob({
        accountIds,
        firstNameTemplate: req.body?.firstNameTemplate,
        lastNameTemplate: req.body?.lastNameTemplate,
        bioTemplate: req.body?.bioTemplate,
        throttlePreset: req.body?.throttlePreset,
        retryLimit,
        avatarFiles: files,
      });

      res.json({
        success: true,
        data: {
          job,
          message: '批量资料任务创建成功',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建批次失败';
      if (message.includes('未启用')) {
        throw new AppError(403, message);
      }
      if (
        message.includes('不能为空') ||
        message.includes('不存在') ||
        message.includes('至少需要') ||
        message.includes('不支持') ||
        message.includes('格式')
      ) {
        throw new AppError(400, message);
      }
      throw new AppError(500, message);
    }
  })
);

/**
 * GET /api/accounts/profile-batch/jobs
 * 获取账号资料批次列表
 */
router.get(
  '/profile-batch/jobs',
  asyncHandler(async (req: Request, res: Response) => {
    const statusRaw = req.query['status'];
    const status =
      typeof statusRaw === 'string' && statusRaw.trim().length > 0
        ? (statusRaw.trim() as AccountProfileBatchJobStatus)
        : undefined;

    if (status && !profileJobStatuses.includes(status)) {
      throw new AppError(400, 'status 参数无效');
    }

    const page = req.query['page'] ? Number(req.query['page']) : 1;
    const pageSize = req.query['pageSize'] ? Number(req.query['pageSize']) : 20;
    if (!Number.isInteger(page) || page <= 0) {
      throw new AppError(400, 'page 参数无效');
    }
    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
      throw new AppError(400, 'pageSize 参数无效');
    }

    const result = accountProfileBatchService.listJobs({
      status,
      page,
      pageSize,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/accounts/profile-batch/jobs/:id
 * 获取账号资料批次详情
 */
router.get(
  '/profile-batch/jobs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, '批次ID不能为空');
    }

    try {
      const detail = accountProfileBatchService.getJob(id);
      res.json({
        success: true,
        data: detail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取批次详情失败';
      if (message.includes('不存在')) {
        throw new AppError(404, message);
      }
      throw new AppError(500, message);
    }
  })
);

/**
 * POST /api/accounts/profile-batch/jobs/:id/cancel
 * 取消账号资料批次
 */
router.post(
  '/profile-batch/jobs/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, '批次ID不能为空');
    }

    try {
      const job = accountProfileBatchService.cancelJob(id);
      res.json({
        success: true,
        data: {
          job,
          message: '批次已取消',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '取消批次失败';
      if (message.includes('不存在')) {
        throw new AppError(404, message);
      }
      if (message.includes('不可取消') || message.includes('未启用')) {
        throw new AppError(400, message);
      }
      throw new AppError(500, message);
    }
  })
);

/**
 * POST /api/accounts/:id/pool-status
 * 手动更新账号池状态
 */
router.post(
  '/:id/pool-status',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const poolStatus = req.body?.poolStatus as AccountPoolStatus | undefined;

    if (!id) {
      throw new AppError(400, '账号ID不能为空');
    }
    if (!poolStatus || !poolStatuses.includes(poolStatus)) {
      throw new AppError(400, 'poolStatus 参数无效');
    }

    logger.info(`更新账号池状态: ${id} -> ${poolStatus}`);

    const existing = await accountService.getAccount(id);
    if (!existing) {
      throw new AppError(404, '账号不存在');
    }

    const account = await accountService.updatePoolStatus(id, poolStatus);

    res.json({
      success: true,
      data: {
        account,
        message: '账号池状态更新成功',
      },
    });
  })
);

/**
 * GET /api/accounts/:id
 * 获取账号详情
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '账号ID不能为空');
    }

    logger.info(`获取账号详情: ${id}`);

    const account = await accountService.getAccount(id);

    if (!account) {
      throw new AppError(404, '账号不存在');
    }

    res.json({
      success: true,
      data: {
        account,
      },
    });
  })
);

/**
 * GET /api/accounts/:id/export
 * 导出会话文件
 */
router.get(
  '/:id/export',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '账号ID不能为空');
    }

    logger.info(`导出会话文件: ${id}`);

    const account = await accountService.getAccount(id);
    if (!account) {
      throw new AppError(404, '账号不存在');
    }

    const sessionBuffer = await accountService.exportAccountSession(id);

    // 设置响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${account.phoneNumber}.session"`);

    res.send(sessionBuffer);
  })
);

/**
 * DELETE /api/accounts/:id
 * 删除账号
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '账号ID不能为空');
    }

    logger.info(`删除账号: ${id}`);

    const account = await accountService.getAccount(id);
    if (!account) {
      throw new AppError(404, '账号不存在');
    }

    await accountService.deleteAccount(id);

    res.json({
      success: true,
      data: {
        message: '账号删除成功',
      },
    });
  })
);

/**
 * GET /api/accounts/:id/status
 * 检查账号状态
 */
router.get(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, '账号ID不能为空');
    }

    logger.info(`检查账号状态: ${id}`);

    const status = await accountService.checkAccountStatus(id);

    res.json({
      success: true,
      data: status,
    });
  })
);

export default router;
