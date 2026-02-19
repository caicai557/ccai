import { TargetDao } from '../../database/dao/TargetDao';
import { ClientPool } from '../../telegram/ClientPool';
import { TaskBlockedPair, TaskReadyPair, Task, TargetAccessErrorCode } from '../../types/task';
import { logger } from '../../utils/logger';

export interface TargetAccessCheckInput {
  accountId: string;
  targetId: string;
  taskType: Task['type'];
  autoJoinEnabled: boolean;
}

export interface TargetAccessCheckResult {
  readyPair?: TaskReadyPair;
  blockedPair?: TaskBlockedPair;
}

export class TargetAccessService {
  private targetDao: TargetDao;
  private clientPool: ClientPool;
  private joinAttemptAt: Map<string, number> = new Map();
  private joinCooldownMs: number;

  constructor(
    targetDao: TargetDao,
    clientPool?: ClientPool,
    joinCooldownMs: number = 5 * 60 * 1000
  ) {
    this.targetDao = targetDao;
    this.clientPool = clientPool || ClientPool.getInstance();
    this.joinCooldownMs = joinCooldownMs;
  }

  async checkAndPrepare(input: TargetAccessCheckInput): Promise<TargetAccessCheckResult> {
    const resolved = this.resolveTargetReference(input.targetId);
    const target = resolved.target;
    const targetId = resolved.canonicalTargetId;
    const telegramId = resolved.telegramId;

    if (!telegramId) {
      const result: TargetAccessCheckResult = {
        blockedPair: this.createBlockedPair(
          input.accountId,
          targetId,
          telegramId,
          'TARGET_ACCESS_DENIED',
          '目标Telegram ID为空',
          false
        ),
      };
      this.logResult(result);
      return result;
    }

    const client = await this.clientPool.getClient(input.accountId);
    if (!client) {
      const result: TargetAccessCheckResult = {
        blockedPair: this.createBlockedPair(
          input.accountId,
          targetId,
          telegramId,
          'CLIENT_NOT_READY',
          '账号未连接或会话无效',
          false
        ),
      };
      this.logResult(result);
      return result;
    }

    const currentAccess = await this.verifyAccess(client, telegramId, input.taskType);
    if (currentAccess.readyPair) {
      const result: TargetAccessCheckResult = {
        readyPair: {
          ...currentAccess.readyPair,
          targetId,
        },
      };
      this.logResult(result);
      return result;
    }

    if (!input.autoJoinEnabled) {
      const result: TargetAccessCheckResult = {
        blockedPair: this.createBlockedPair(
          input.accountId,
          targetId,
          telegramId,
          currentAccess.code || 'TARGET_NOT_JOINED',
          currentAccess.message || '目标权限检查失败',
          false
        ),
      };
      this.logResult(result);
      return result;
    }

    if (this.isJoinCoolingDown(input.accountId, targetId)) {
      const result: TargetAccessCheckResult = {
        blockedPair: this.createBlockedPair(
          input.accountId,
          targetId,
          telegramId,
          'TARGET_JOIN_COOLDOWN',
          '近期已尝试自动加入，请稍后重试',
          true
        ),
      };
      this.logResult(result);
      return result;
    }

    this.recordJoinAttempt(input.accountId, targetId);

    const inviteLink = target?.inviteLink?.trim();
    const joinResult = inviteLink
      ? await client.joinByInviteLink(inviteLink)
      : await client.joinPublicTarget(telegramId);

    if (!joinResult.success) {
      const result: TargetAccessCheckResult = {
        blockedPair: this.createBlockedPair(
          input.accountId,
          targetId,
          telegramId,
          this.normalizeCode(joinResult.code, Boolean(inviteLink)),
          joinResult.message || '自动加入失败',
          true
        ),
      };
      this.logResult(result);
      return result;
    }

    const finalAccess = await this.verifyAccess(client, telegramId, input.taskType);
    if (finalAccess.readyPair) {
      const result: TargetAccessCheckResult = {
        readyPair: {
          ...finalAccess.readyPair,
          targetId,
        },
      };
      this.logResult(result);
      return result;
    }

    const result: TargetAccessCheckResult = {
      blockedPair: this.createBlockedPair(
        input.accountId,
        targetId,
        telegramId,
        finalAccess.code || 'TARGET_ACCESS_DENIED',
        finalAccess.message || '自动加入后仍不可用',
        true
      ),
    };
    this.logResult(result);
    return result;
  }

  /**
   * 兼容两种输入：
   * 1) 内部目标ID（targets.id）
   * 2) 直接telegramId（历史任务可能直接存 telegramId）
   */
  private resolveTargetReference(inputTargetId: string): {
    canonicalTargetId: string;
    telegramId: string;
    target?: {
      id: string;
      telegramId: string;
      inviteLink?: string;
    };
  } {
    const rawTargetId = String(inputTargetId || '').trim();
    if (!rawTargetId) {
      return {
        canonicalTargetId: '',
        telegramId: '',
      };
    }

    const byId = this.targetDao.findById(rawTargetId);
    if (byId) {
      return {
        canonicalTargetId: byId.id,
        telegramId: String(byId.telegramId || '').trim(),
        target: {
          id: byId.id,
          telegramId: String(byId.telegramId || '').trim(),
          inviteLink: byId.inviteLink,
        },
      };
    }

    const byTelegramId = this.targetDao.findByTelegramId(rawTargetId);
    if (byTelegramId) {
      return {
        canonicalTargetId: byTelegramId.id,
        telegramId: String(byTelegramId.telegramId || '').trim(),
        target: {
          id: byTelegramId.id,
          telegramId: String(byTelegramId.telegramId || '').trim(),
          inviteLink: byTelegramId.inviteLink,
        },
      };
    }

    // 回退为“直接使用输入值作为telegramId”
    return {
      canonicalTargetId: rawTargetId,
      telegramId: rawTargetId,
    };
  }

  private async verifyAccess(
    client: NonNullable<Awaited<ReturnType<ClientPool['getClient']>>>,
    telegramId: string,
    taskType: Task['type']
  ): Promise<{
    readyPair?: TaskReadyPair;
    code?: TargetAccessErrorCode;
    message?: string;
  }> {
    const membership = await client.checkMembership(telegramId);
    if (!membership.success) {
      return {
        code: membership.code || 'TARGET_ACCESS_DENIED',
        message: membership.message || '无法检查目标成员状态',
      };
    }

    if (!membership.isMember) {
      return {
        code: membership.code || 'TARGET_NOT_JOINED',
        message: membership.message || '账号尚未加入目标',
      };
    }

    if (taskType === 'channel_monitoring') {
      const resolved = await client.resolveTarget(telegramId);
      if (!resolved.success) {
        return {
          code: resolved.code || 'TARGET_ACCESS_DENIED',
          message: resolved.message || '目标解析失败',
        };
      }

      return {
        readyPair: {
          accountId: client.getAccountId(),
          targetId: '',
          telegramId: resolved.normalizedPeerId || telegramId,
        },
      };
    }

    const permission = await client.checkWritePermission(telegramId);
    if (!permission.success) {
      return {
        code: permission.code || 'TARGET_ACCESS_DENIED',
        message: permission.message || '无法检查目标发言权限',
      };
    }

    if (!permission.canWrite) {
      return {
        code: permission.code || 'TARGET_WRITE_FORBIDDEN',
        message: permission.message || '账号在目标中无发言权限',
      };
    }

    const resolved = await client.resolveTarget(telegramId);
    const normalizedTelegramId = resolved.normalizedPeerId || telegramId;

    return {
      readyPair: {
        accountId: client.getAccountId(),
        targetId: '',
        telegramId: normalizedTelegramId,
      },
    };
  }

  private createBlockedPair(
    accountId: string,
    targetId: string,
    telegramId: string,
    code: TargetAccessErrorCode,
    message: string,
    autoJoinAttempted: boolean
  ): TaskBlockedPair {
    return {
      accountId,
      targetId,
      telegramId,
      code,
      message,
      autoJoinAttempted,
    };
  }

  private normalizeCode(
    code: TargetAccessErrorCode | undefined,
    hasInviteLink: boolean
  ): TargetAccessErrorCode {
    if (code) {
      return code;
    }

    if (!hasInviteLink) {
      return 'TARGET_PRIVATE_NO_INVITE';
    }

    return 'TARGET_JOIN_FAILED';
  }

  private getJoinKey(accountId: string, targetId: string): string {
    return `${accountId}:${targetId}`;
  }

  private isJoinCoolingDown(accountId: string, targetId: string): boolean {
    const key = this.getJoinKey(accountId, targetId);
    const lastAttemptAt = this.joinAttemptAt.get(key);
    if (!lastAttemptAt) {
      return false;
    }

    return Date.now() - lastAttemptAt < this.joinCooldownMs;
  }

  private recordJoinAttempt(accountId: string, targetId: string): void {
    const key = this.getJoinKey(accountId, targetId);
    this.joinAttemptAt.set(key, Date.now());
    logger.debug(`记录自动加入尝试: ${key}`);
  }

  private logResult(result: TargetAccessCheckResult): void {
    if (result.readyPair) {
      logger.info(
        `目标预检通过: account=${result.readyPair.accountId}, target=${result.readyPair.targetId}, telegram=${result.readyPair.telegramId}`
      );
      return;
    }

    if (result.blockedPair) {
      logger.warn(
        `目标预检阻塞: account=${result.blockedPair.accountId}, target=${result.blockedPair.targetId}, telegram=${result.blockedPair.telegramId}, code=${result.blockedPair.code}, autoJoin=${result.blockedPair.autoJoinAttempted}, message=${result.blockedPair.message}`
      );
    }
  }
}
