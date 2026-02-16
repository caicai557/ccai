import { TargetDao } from '../../database/dao/TargetDao';
import { BatchAddTargetInput, BatchAddTargetResult, DiscoveredTarget } from '../../types/target';
import { ClientPool } from '../../telegram/ClientPool';

export class TargetDiscoveryService {
  constructor(
    private readonly targetDao: TargetDao,
    private readonly clientPool: ClientPool = ClientPool.getInstance()
  ) {}

  async searchByKeyword(
    accountId: string,
    keyword: string,
    limit: number = 50
  ): Promise<DiscoveredTarget[]> {
    const client = await this.clientPool.getClient(accountId);
    if (!client) {
      throw new Error('账号未连接或会话无效');
    }

    return client.searchTargets(keyword, limit);
  }

  batchAddTargets(items: BatchAddTargetInput[]): BatchAddTargetResult {
    const created: BatchAddTargetResult['created'] = [];
    const duplicated: BatchAddTargetResult['duplicated'] = [];
    const failed: BatchAddTargetResult['failed'] = [];

    const seenTelegramIds = new Set<string>();

    for (const item of items) {
      const normalizedId = item.telegramId.trim();
      const normalizedTitle = item.title.trim();
      const normalizedInviteLink = item.inviteLink?.trim();

      if (!normalizedId || !normalizedTitle) {
        failed.push({
          telegramId: item.telegramId,
          title: item.title,
          reason: 'telegramId 和 title 不能为空',
        });
        continue;
      }

      if (item.type !== 'group' && item.type !== 'channel') {
        failed.push({
          telegramId: item.telegramId,
          title: item.title,
          reason: 'type 必须是 group 或 channel',
        });
        continue;
      }

      if (seenTelegramIds.has(normalizedId)) {
        failed.push({
          telegramId: normalizedId,
          title: normalizedTitle,
          reason: '请求中包含重复 telegramId',
        });
        continue;
      }
      seenTelegramIds.add(normalizedId);

      const existed = this.targetDao.findByTelegramId(normalizedId);
      if (existed) {
        duplicated.push(existed);
        continue;
      }

      const target = this.targetDao.create({
        type: item.type,
        telegramId: normalizedId,
        title: normalizedTitle,
        inviteLink: normalizedInviteLink || undefined,
        enabled: true,
      });
      created.push(target);
    }

    return {
      created,
      duplicated,
      failed,
    };
  }
}
