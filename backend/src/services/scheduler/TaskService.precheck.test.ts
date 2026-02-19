import Database from 'better-sqlite3';
import { TaskService } from './TaskService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { ClientPool } from '../../telegram/ClientPool';
import { TargetAccessCheckInput, TargetAccessCheckResult } from '../target/TargetAccessService';

const createMockTargetAccessService = (mode: 'all-ready' | 'mixed') => ({
  checkAndPrepare: async (input: TargetAccessCheckInput): Promise<TargetAccessCheckResult> => {
    if (mode === 'all-ready') {
      return {
        readyPair: {
          accountId: input.accountId,
          targetId: input.targetId,
          telegramId: input.targetId,
        },
      };
    }

    if (input.accountId.includes('blocked')) {
      return {
        blockedPair: {
          accountId: input.accountId,
          targetId: input.targetId,
          telegramId: input.targetId,
          code: 'TARGET_WRITE_FORBIDDEN',
          message: '账号没有发言权限',
          autoJoinAttempted: false,
        },
      };
    }

    return {
      readyPair: {
        accountId: input.accountId,
        targetId: input.targetId,
        telegramId: input.targetId,
      },
    };
  },
});

describe('TaskService 预检策略', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);
    DaoFactory.initialize(db);
  });

  afterEach(() => {
    ClientPool.getInstance().stopBackgroundTasks();
    db.close();
  });

  it('partial策略：存在可用组合时应启动并返回阻塞明细', async () => {
    const taskService = new TaskService(db, {
      targetAccessService: createMockTargetAccessService('mixed'),
    });

    const task = await taskService.createTask({
      type: 'group_posting',
      accountIds: ['account-ready', 'account-blocked'],
      targetIds: ['target-1'],
      config: {
        interval: 10,
        randomDelay: 0,
        precheckPolicy: 'partial',
      },
    });

    const startResult = await taskService.startTask(task.id);
    const runningTask = await taskService.getTask(task.id);

    expect(startResult.started).toBe(true);
    expect(startResult.precheck.policy).toBe('partial');
    expect(startResult.precheck.readyPairs).toHaveLength(1);
    expect(startResult.precheck.blockedPairs).toHaveLength(1);
    expect(startResult.precheck.blockedReasons['TARGET_WRITE_FORBIDDEN']).toBe(1);
    expect(runningTask?.status).toBe('running');

    await taskService.stopTask(task.id);
  });

  it('strict策略：存在阻塞组合时应拒绝启动', async () => {
    const taskService = new TaskService(db, {
      targetAccessService: createMockTargetAccessService('mixed'),
    });

    const task = await taskService.createTask({
      type: 'group_posting',
      accountIds: ['account-ready', 'account-blocked'],
      targetIds: ['target-1'],
      config: {
        interval: 10,
        randomDelay: 0,
        precheckPolicy: 'strict',
      },
    });

    await expect(taskService.startTask(task.id)).rejects.toThrow(
      '任务预检失败: strict策略下存在不可用账号-目标组合'
    );

    const stoppedTask = await taskService.getTask(task.id);
    expect(stoppedTask?.status).toBe('stopped');
  });

  it('全部可用时应返回空阻塞列表', async () => {
    const taskService = new TaskService(db, {
      targetAccessService: createMockTargetAccessService('all-ready'),
    });

    const task = await taskService.createTask({
      type: 'group_posting',
      accountIds: ['account-ready-1'],
      targetIds: ['target-1', 'target-2'],
      config: {
        interval: 10,
        randomDelay: 0,
        precheckPolicy: 'partial',
      },
    });

    const startResult = await taskService.startTask(task.id);
    expect(startResult.precheck.readyPairs).toHaveLength(2);
    expect(startResult.precheck.blockedPairs).toHaveLength(0);
    expect(startResult.precheck.blockedReasons).toEqual({});

    await taskService.stopTask(task.id);
  });
});
