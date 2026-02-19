import { TelegramClientWrapper } from './TelegramClientWrapper';
import { Api } from 'telegram/tl';

describe('TelegramClientWrapper 资料更新能力', () => {
  beforeAll(() => {
    process.env['TELEGRAM_API_ID'] = process.env['TELEGRAM_API_ID'] || '123456';
    process.env['TELEGRAM_API_HASH'] = process.env['TELEGRAM_API_HASH'] || 'test_api_hash';
  });

  test('updateSelfProfile 成功时应调用 account.UpdateProfile', async () => {
    const wrapper = new TelegramClientWrapper('acct-profile-test-1', '+8613000000001');
    const invokeMock = jest.fn().mockResolvedValue({});

    (wrapper as any).connect = jest.fn().mockResolvedValue(undefined);
    (wrapper as any).client = {
      invoke: invokeMock,
    };

    await wrapper.updateSelfProfile({
      firstName: '名字',
      lastName: '姓氏',
      bio: '简介',
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const request = invokeMock.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Api.account.UpdateProfile);
  });

  test('updateSelfProfile 发生 FloodWait 时应映射错误码', async () => {
    const wrapper = new TelegramClientWrapper('acct-profile-test-2', '+8613000000002');

    (wrapper as any).connect = jest.fn().mockResolvedValue(undefined);
    (wrapper as any).client = {
      invoke: jest.fn().mockRejectedValue({ errorMessage: 'FLOOD_WAIT_35' }),
    };

    await expect(
      wrapper.updateSelfProfile({
        firstName: 'A',
      })
    ).rejects.toMatchObject({
      code: 'FLOOD_WAIT',
      retryAfterSeconds: 35,
    });
  });

  test('updateSelfAvatar 发生头像格式错误时应映射为 AVATAR_INVALID', async () => {
    const wrapper = new TelegramClientWrapper('acct-profile-test-3', '+8613000000003');

    (wrapper as any).connect = jest.fn().mockResolvedValue(undefined);
    (wrapper as any).client = {
      uploadFile: jest.fn().mockResolvedValue({}),
      invoke: jest.fn().mockRejectedValue({ errorMessage: 'PHOTO_INVALID_DIMENSIONS' }),
    };

    await expect(
      wrapper.updateSelfAvatar({
        fileName: 'avatar.jpg',
        fileBuffer: Buffer.from('avatar'),
      })
    ).rejects.toMatchObject({
      code: 'AVATAR_INVALID',
    });
  });
});
