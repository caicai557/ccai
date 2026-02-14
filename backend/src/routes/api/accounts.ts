/**
 * 账号管理API路由
 */
import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { AccountService } from '../../services/AccountService';
import { logger } from '../../utils/logger';
import multer from 'multer';

const router: Router = Router();
const accountService = new AccountService();

// 配置文件上传
const upload = multer({
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

    const result = await accountService.addAccount(phoneNumber);

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

    await accountService.verifyPassword(accountId, password);

    const account = await accountService.getAccount(accountId);

    res.json({
      success: true,
      data: {
        account,
        message: '两步验证成功',
      },
    });
  })
);

/**
 * POST /api/accounts/import
 * 导入会话文件
 */
router.post(
  '/import',
  upload.single('sessionFile'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, '请上传会话文件');
    }

    logger.info(`导入会话文件: ${req.file.originalname}`);

    const account = await accountService.importAccountFromSession(
      req.file.buffer,
      req.file.originalname
    );

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
  asyncHandler(async (_req: Request, res: Response) => {
    logger.info('获取账号列表');

    const accounts = await accountService.getAllAccounts();

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
