import Database from 'better-sqlite3';
import { TaskService } from './TaskService';
import { initSchema } from '../../database/schema';
import { ClientPool } from '../../telegram/ClientPool';

describe('TaskService', () => {
  let db: Database.Database;
  let taskService: TaskService;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    initSchema(db);
    taskService = new TaskService(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    ClientPool.getInstance().stopBackgroundTasks();
  });

  describe('任务CRUD操作', () => {
    it('应该能够创建任务', async () => {
      const task = await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.type).toBe('group_posting');
      expect(task.status).toBe('stopped');
      expect(task.accountIds).toEqual(['account1']);
      expect(task.targetIds).toEqual(['target1']);
    });

    it('应该能够获取任务', async () => {
      const created = await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      const task = await taskService.getTask(created.id);
      expect(task).toBeDefined();
      expect(task?.id).toBe(created.id);
    });

    it('应该能够更新任务', async () => {
      const created = await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      const updated = await taskService.updateTask(created.id, {
        accountIds: ['account1', 'account2'],
      });

      expect(updated.accountIds).toEqual(['account1', 'account2']);
    });

    it('应该能够删除任务', async () => {
      const created = await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      await taskService.deleteTask(created.id);

      const task = await taskService.getTask(created.id);
      expect(task).toBeNull();
    });

    it('应该能够获取所有任务', async () => {
      await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      await taskService.createTask({
        type: 'channel_monitoring',
        accountIds: ['account2'],
        targetIds: ['target2'],
        config: {
          interval: 15,
          randomDelay: 2,
          commentProbability: 0.5,
        },
      });

      const tasks = await taskService.getAllTasks();
      expect(tasks).toHaveLength(2);
    });
  });

  describe('任务配置验证', () => {
    it('应该拒绝缺少必需字段的任务', async () => {
      await expect(
        taskService.createTask({
          type: 'group_posting',
          accountIds: [],
          targetIds: ['target1'],
          config: {
            interval: 10,
            randomDelay: 1,
          },
        })
      ).rejects.toThrow('账号ID列表不能为空');
    });

    it('应该拒绝间隔时间小于10分钟的发送任务', async () => {
      await expect(
        taskService.createTask({
          type: 'group_posting',
          accountIds: ['account1'],
          targetIds: ['target1'],
          config: {
            interval: 5,
            randomDelay: 1,
          },
        })
      ).rejects.toThrow('发送间隔不能少于10分钟');
    });

    it('应该拒绝无效的评论概率', async () => {
      await expect(
        taskService.createTask({
          type: 'channel_monitoring',
          accountIds: ['account1'],
          targetIds: ['target1'],
          config: {
            interval: 10,
            randomDelay: 1,
            commentProbability: 1.5,
          },
        })
      ).rejects.toThrow('评论概率必须在0-1之间');
    });
  });

  describe('任务状态管理', () => {
    it('应该能够获取任务统计信息', async () => {
      const task = await taskService.createTask({
        type: 'group_posting',
        accountIds: ['account1'],
        targetIds: ['target1'],
        config: {
          interval: 10,
          randomDelay: 1,
        },
      });

      // 启动任务会创建上下文
      // 注意：这里不实际启动，因为需要模拟Telegram客户端
      const stats = taskService.getTaskStats(task.id);
      expect(stats).toBeNull(); // 未启动的任务没有统计信息
    });
  });
});
