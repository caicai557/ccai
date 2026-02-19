import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DaoFactory } from '../../database/dao';
import { runMigrations } from '../../database/migrations';
import { AccountProfileBatchService } from './AccountProfileBatchService';

const waitUntil = async (predicate: () => boolean, timeoutMs: number = 2000): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('等待条件超时');
};

describe('AccountProfileBatchService', () => {
  let db: Database.Database;
  let testDbPath: string;
  let accountDao: ReturnType<typeof DaoFactory.getInstance>['getAccountDao'];

  beforeAll(() => {
    testDbPath = path.join(__dirname, '../../../test-data/test-account-profile-batch.db');
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    DaoFactory.initialize(db);
    accountDao = DaoFactory.getInstance().getAccountDao();
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM account_profile_job_items').run();
    db.prepare('DELETE FROM account_profile_jobs').run();
    db.prepare('DELETE FROM accounts').run();
  });

  test('应支持模板渲染与头像轮询分配', async () => {
    const accountA = accountDao.create({
      phoneNumber: '+8613500000001',
      session: 'session-a',
      status: 'online',
    });
    const accountB = accountDao.create({
      phoneNumber: '+8613600000002',
      session: 'session-b',
      status: 'online',
    });

    const updateSelfProfile = jest.fn().mockResolvedValue(undefined);
    const updateSelfAvatar = jest.fn().mockResolvedValue(undefined);
    const getClient = jest.fn().mockResolvedValue({
      updateSelfProfile,
      updateSelfAvatar,
    });
    const service = new AccountProfileBatchService({
      accountService: {
        getClient,
      },
    });

    const job = await service.createJob({
      accountIds: [accountA.id, accountB.id],
      firstNameTemplate: '昵称{index}',
      lastNameTemplate: '尾号{phoneLast4}',
      throttlePreset: 'fast',
      retryLimit: 1,
      avatarFiles: [
        {
          originalName: 'one.jpg',
          mimeType: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('one'),
        },
        {
          originalName: 'two.jpg',
          mimeType: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('two'),
        },
      ],
    });

    await waitUntil(() => {
      const status = service.getJob(job.id).job.status;
      return status === 'completed' || status === 'failed';
    });

    const detail = service.getJob(job.id);
    expect(detail.items.length).toBe(2);
    expect(detail.items.every((item) => item.status === 'success')).toBe(true);
    expect(detail.items[0]?.appliedFirstName).toBe('昵称1');
    expect(detail.items[0]?.appliedLastName).toBe('尾号0001');
    expect(detail.items[1]?.appliedFirstName).toBe('昵称2');
    expect(detail.items[0]?.avatarFile).not.toBe(detail.items[1]?.avatarFile);
    expect(getClient).toHaveBeenCalledTimes(2);
    expect(updateSelfProfile).toHaveBeenCalledTimes(2);
    expect(updateSelfAvatar).toHaveBeenCalledTimes(2);
  });

  test('失败后应按 retryLimit 自动重试一次并成功', async () => {
    const account = accountDao.create({
      phoneNumber: '+8613700000003',
      session: 'session-c',
      status: 'online',
    });

    let attempt = 0;
    const updateSelfProfile = jest.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        const err = new Error('网络抖动') as Error & { code?: string };
        err.code = 'NETWORK_ERROR';
        throw err;
      }
    });

    const service = new AccountProfileBatchService({
      accountService: {
        getClient: jest.fn().mockResolvedValue({
          updateSelfProfile,
          updateSelfAvatar: jest.fn().mockResolvedValue(undefined),
        }),
      },
    });

    const job = await service.createJob({
      accountIds: [account.id],
      firstNameTemplate: '测试{index}',
      retryLimit: 1,
      throttlePreset: 'fast',
    });

    await waitUntil(() => {
      const status = service.getJob(job.id).job.status;
      return status === 'completed' || status === 'failed';
    });

    const detail = service.getJob(job.id);
    expect(detail.items[0]?.status).toBe('success');
    expect(detail.items[0]?.attempt).toBe(2);
    expect(updateSelfProfile).toHaveBeenCalledTimes(2);
  });

  test('取消批次后应将未执行项标记为 cancelled', async () => {
    const accountA = accountDao.create({
      phoneNumber: '+8613800000004',
      session: 'session-d',
      status: 'online',
    });
    const accountB = accountDao.create({
      phoneNumber: '+8613900000005',
      session: 'session-e',
      status: 'online',
    });

    const service = new AccountProfileBatchService({
      accountService: {
        getClient: jest.fn().mockResolvedValue({
          updateSelfProfile: () =>
            new Promise<void>((resolve) => {
              setTimeout(resolve, 80);
            }),
          updateSelfAvatar: jest.fn().mockResolvedValue(undefined),
        }),
      },
    });

    const job = await service.createJob({
      accountIds: [accountA.id, accountB.id],
      firstNameTemplate: '取消测试{index}',
      retryLimit: 1,
      throttlePreset: 'fast',
    });

    const cancelled = service.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');

    await waitUntil(() => {
      const detail = service.getJob(job.id);
      return detail.items.some((item) => item.status === 'cancelled');
    });

    const detail = service.getJob(job.id);
    expect(detail.job.status).toBe('cancelled');
    expect(detail.items.some((item) => item.status === 'cancelled')).toBe(true);
  });
});
