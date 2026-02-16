import { TargetDiscoveryService } from './TargetDiscoveryService';

describe('TargetDiscoveryService', () => {
  test('batchAddTargets 应该去重并返回创建结果', () => {
    const existedMap = new Map<string, any>();

    const targetDao = {
      findByTelegramId: jest.fn((telegramId: string) => existedMap.get(telegramId)),
      create: jest.fn((data: any) => {
        const created = {
          id: `id-${data.telegramId}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        existedMap.set(data.telegramId, created);
        return created;
      }),
    };

    const service = new TargetDiscoveryService(targetDao as any, {
      getClient: jest.fn(),
    } as any);

    const result = service.batchAddTargets([
      { type: 'group', telegramId: '10001', title: '群1' },
      { type: 'group', telegramId: '10001', title: '群1重复' },
      { type: 'channel', telegramId: '20001', title: '频道1' },
      { type: 'channel', telegramId: '', title: '无效数据' },
    ]);

    expect(result.created).toHaveLength(2);
    expect(result.duplicated).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
  });

  test('batchAddTargets 应该识别数据库已存在记录为重复', () => {
    const existed = {
      id: 't-1',
      type: 'group',
      telegramId: '10001',
      title: '已存在群组',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const targetDao = {
      findByTelegramId: jest.fn((telegramId: string) => (telegramId === '10001' ? existed : undefined)),
      create: jest.fn(),
    };

    const service = new TargetDiscoveryService(targetDao as any, {
      getClient: jest.fn(),
    } as any);

    const result = service.batchAddTargets([{ type: 'group', telegramId: '10001', title: '新标题' }]);

    expect(result.created).toHaveLength(0);
    expect(result.duplicated).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(targetDao.create).not.toHaveBeenCalled();
  });

  test('searchByKeyword 在账号客户端不可用时应抛错', async () => {
    const service = new TargetDiscoveryService({} as any, {
      getClient: jest.fn().mockResolvedValue(undefined),
    } as any);

    await expect(service.searchByKeyword('acc-1', 'test')).rejects.toThrow('账号未连接或会话无效');
  });
});
