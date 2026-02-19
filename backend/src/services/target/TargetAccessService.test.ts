import { TargetAccessService } from './TargetAccessService';

describe('TargetAccessService', () => {
  const createMockClient = () =>
    ({
      getAccountId: jest.fn(() => 'acc-1'),
      checkMembership: jest.fn(async () => ({
        success: true,
        isMember: true,
      })),
      checkWritePermission: jest.fn(async () => ({
        success: true,
        canWrite: true,
      })),
      resolveTarget: jest.fn(async (targetId: string) => ({
        success: true,
        normalizedPeerId: targetId,
      })),
      joinByInviteLink: jest.fn(async () => ({ success: true })),
      joinPublicTarget: jest.fn(async () => ({ success: true })),
    });

  test('应兼容直接 telegramId（目标记录不存在）', async () => {
    const mockClient = createMockClient();
    mockClient.resolveTarget.mockResolvedValue({
      success: true,
      normalizedPeerId: '-10012345',
    });

    const service = new TargetAccessService(
      {
        findById: jest.fn(() => undefined),
        findByTelegramId: jest.fn(() => undefined),
      } as any,
      {
        getClient: jest.fn(async () => mockClient),
      } as any
    );

    const result = await service.checkAndPrepare({
      accountId: 'acc-1',
      targetId: '12345',
      taskType: 'group_posting',
      autoJoinEnabled: false,
    });

    expect(result.readyPair).toEqual({
      accountId: 'acc-1',
      targetId: '12345',
      telegramId: '-10012345',
    });
  });

  test('输入为 telegramId 时，若命中 targets 表应返回规范 targetId', async () => {
    const mockClient = createMockClient();
    const service = new TargetAccessService(
      {
        findById: jest.fn(() => undefined),
        findByTelegramId: jest.fn((telegramId: string) =>
          telegramId === '-100999'
            ? {
                id: 'target-999',
                telegramId: '-100999',
                inviteLink: 'https://t.me/+abc123',
              }
            : undefined
        ),
      } as any,
      {
        getClient: jest.fn(async () => mockClient),
      } as any
    );

    const result = await service.checkAndPrepare({
      accountId: 'acc-1',
      targetId: '-100999',
      taskType: 'group_posting',
      autoJoinEnabled: false,
    });

    expect(result.readyPair).toEqual({
      accountId: 'acc-1',
      targetId: 'target-999',
      telegramId: '-100999',
    });
  });
});
