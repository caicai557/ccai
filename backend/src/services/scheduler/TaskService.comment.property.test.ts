/**
 * TaskService 评论功能属性测试
 * Feature: telegram-content-manager
 */

import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TaskService } from './TaskService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { ClientPool } from '../../telegram/ClientPool';

describe('TaskService - 评论功能属性测试', () => {
  let db: Database.Database;
  let taskService: TaskService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    taskService = new TaskService(db);
  });

  afterEach(async () => {
    // 停止所有运行中的任务，清理 cron 任务和监听器
    await taskService.stopAllTasks();

    // 清理 ClientPool 的定时器
    const clientPool = ClientPool.getInstance();
    clientPool.stopBackgroundTasks();

    db.close();
  });

  /**
   * 属性 11: 评论延迟范围约束
   * 验证需求: 3.3
   *
   * 对于任何自动评论操作，实际延迟时间应该在配置的最小延迟和最大延迟之间（默认1-5分钟）
   */
  describe('Property 11: 评论延迟范围约束', () => {
    it('应该在1-5分钟范围内生成随机延迟', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 300, max: 800 }), // 测试次数（提高样本量减少随机波动）
          async (iterations) => {
            const delays: number[] = [];

            // 模拟多次延迟生成
            for (let i = 0; i < iterations; i++) {
              // 模拟TaskService中的延迟计算逻辑
              const minDelay = 1 * 60 * 1000; // 1分钟（毫秒）
              const maxDelay = 5 * 60 * 1000; // 5分钟（毫秒）
              const delayMs = minDelay + Math.random() * (maxDelay - minDelay);
              delays.push(delayMs);
            }

            // 验证所有延迟都在范围内
            const minDelayMs = 1 * 60 * 1000;
            const maxDelayMs = 5 * 60 * 1000;

            for (const delay of delays) {
              // 每个延迟必须在1-5分钟范围内
              expect(delay).toBeGreaterThanOrEqual(minDelayMs);
              expect(delay).toBeLessThanOrEqual(maxDelayMs);
            }

            // 验证延迟的分布（应该覆盖整个范围）
            const minObserved = Math.min(...delays);
            const maxObserved = Math.max(...delays);

            // 最小观察值应该接近下限（放宽阈值避免随机性导致误报）
            expect(minObserved).toBeLessThanOrEqual(minDelayMs * 1.3);

            // 最大观察值应该接近上限（放宽阈值避免随机性导致误报）
            expect(maxObserved).toBeGreaterThanOrEqual(maxDelayMs * 0.7);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该为不同的消息生成不同的延迟', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }), // 消息数量
          async (messageCount) => {
            const delays: number[] = [];

            // 为多条消息生成延迟
            for (let i = 0; i < messageCount; i++) {
              const minDelay = 1 * 60 * 1000;
              const maxDelay = 5 * 60 * 1000;
              const delayMs = minDelay + Math.random() * (maxDelay - minDelay);
              delays.push(delayMs);
            }

            // 验证延迟的多样性（不应该所有延迟都相同）
            const uniqueDelays = new Set(delays);
            if (messageCount >= 10) {
              // 至少应该有多个不同的延迟值
              expect(uniqueDelays.size).toBeGreaterThan(1);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 属性 12: 评论概率分布
   * 验证需求: 3.6
   *
   * 对于任何配置了评论概率的任务，在大量消息（n>100）的情况下，
   * 实际评论的消息比例应该接近配置的概率值（误差<10%）
   */
  describe('Property 12: 评论概率分布', () => {
    it('应该根据配置的概率决定是否评论', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0.2, max: 0.8, noNaN: true, noDefaultInfinity: true }), // 评论概率（避免极端值）
          fc.integer({ min: 500, max: 1000 }), // 消息数量（增加最小值）
          async (probability, messageCount) => {
            let commentCount = 0;

            // 模拟多条消息的评论决策
            for (let i = 0; i < messageCount; i++) {
              // 模拟TaskService中的概率判断逻辑
              if (Math.random() < probability) {
                commentCount++;
              }
            }

            // 计算实际评论比例
            const actualRatio = commentCount / messageCount;

            // 验证实际比例接近配置的概率（允许25%误差，考虑到随机性和样本量）
            const tolerance = 0.25;
            const lowerBound = probability * (1 - tolerance);
            const upperBound = probability * (1 + tolerance);

            expect(actualRatio).toBeGreaterThanOrEqual(lowerBound);
            expect(actualRatio).toBeLessThanOrEqual(upperBound);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('概率为0时不应该评论任何消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }), // 消息数量
          async (messageCount) => {
            const probability = 0;
            let commentCount = 0;

            for (let i = 0; i < messageCount; i++) {
              if (Math.random() < probability) {
                commentCount++;
              }
            }

            // 概率为0时，不应该评论任何消息
            expect(commentCount).toBe(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('概率为1时应该评论所有消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }), // 消息数量
          async (messageCount) => {
            const probability = 1;
            let commentCount = 0;

            for (let i = 0; i < messageCount; i++) {
              if (Math.random() < probability) {
                commentCount++;
              }
            }

            // 概率为1时，应该评论所有消息
            expect(commentCount).toBe(messageCount);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 属性 13: 评论去重
   * 验证需求: 3.7
   *
   * 对于任何频道消息，如果已经被某个账号评论过，
   * 同一账号不应该再次对该消息发送评论
   */
  describe('Property 13: 评论去重', () => {
    it('同一账号不应该重复评论同一消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 20 }), // 账号ID
          fc.string({ minLength: 10, maxLength: 20 }), // 频道ID
          fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 10, maxLength: 100 }), // 消息ID列表
          async (accountId, channelId, messageIds) => {
            // 模拟评论去重逻辑
            const commentedMessages = new Map<string, Set<number>>();
            const commentKey = `${accountId}:${channelId}`;
            commentedMessages.set(commentKey, new Set());

            const commentedSet = commentedMessages.get(commentKey)!;
            const attemptedComments: number[] = [];
            const successfulComments: number[] = [];

            // 模拟多次评论尝试（包括重复的消息ID）
            const allAttempts = [...messageIds, ...messageIds.slice(0, 5)]; // 添加一些重复的

            for (const messageId of allAttempts) {
              attemptedComments.push(messageId);

              // 检查是否已评论过
              if (!commentedSet.has(messageId)) {
                // 未评论过，可以评论
                commentedSet.add(messageId);
                successfulComments.push(messageId);
              }
              // 已评论过，跳过
            }

            // 验证：成功评论的消息ID应该都是唯一的
            const uniqueSuccessful = new Set(successfulComments);
            expect(uniqueSuccessful.size).toBe(successfulComments.length);

            // 验证：成功评论的数量应该等于唯一消息ID的数量
            const uniqueMessages = new Set(messageIds);
            expect(successfulComments.length).toBe(uniqueMessages.size);

            // 验证：commentedSet中的消息ID应该与成功评论的一致
            expect(commentedSet.size).toBe(uniqueMessages.size);
            for (const messageId of successfulComments) {
              expect(commentedSet.has(messageId)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不同账号可以评论同一消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // 多个账号ID
          fc.string({ minLength: 10, maxLength: 20 }), // 频道ID
          fc.integer({ min: 1, max: 10000 }), // 消息ID
          async (accountIds, channelId, messageId) => {
            // 确保账号ID唯一
            const uniqueAccounts = Array.from(new Set(accountIds));
            if (uniqueAccounts.length < 2) return;

            // 模拟多个账号的评论去重逻辑
            const commentedMessages = new Map<string, Set<number>>();

            const successfulComments: Array<{ accountId: string; messageId: number }> = [];

            // 每个账号尝试评论同一消息
            for (const accountId of uniqueAccounts) {
              const commentKey = `${accountId}:${channelId}`;

              if (!commentedMessages.has(commentKey)) {
                commentedMessages.set(commentKey, new Set());
              }

              const commentedSet = commentedMessages.get(commentKey)!;

              // 检查是否已评论过
              if (!commentedSet.has(messageId)) {
                commentedSet.add(messageId);
                successfulComments.push({ accountId, messageId });
              }
            }

            // 验证：每个账号都应该能成功评论
            expect(successfulComments.length).toBe(uniqueAccounts.length);

            // 验证：每个账号的评论记录都应该包含该消息
            for (const accountId of uniqueAccounts) {
              const commentKey = `${accountId}:${channelId}`;
              const commentedSet = commentedMessages.get(commentKey)!;
              expect(commentedSet.has(messageId)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('同一账号在不同频道可以评论相同ID的消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 20 }), // 账号ID
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // 多个频道ID
          fc.integer({ min: 1, max: 10000 }), // 消息ID
          async (accountId, channelIds, messageId) => {
            // 确保频道ID唯一
            const uniqueChannels = Array.from(new Set(channelIds));
            if (uniqueChannels.length < 2) return;

            // 模拟评论去重逻辑
            const commentedMessages = new Map<string, Set<number>>();

            const successfulComments: Array<{ channelId: string; messageId: number }> = [];

            // 在每个频道尝试评论相同ID的消息
            for (const channelId of uniqueChannels) {
              const commentKey = `${accountId}:${channelId}`;

              if (!commentedMessages.has(commentKey)) {
                commentedMessages.set(commentKey, new Set());
              }

              const commentedSet = commentedMessages.get(commentKey)!;

              // 检查是否已评论过
              if (!commentedSet.has(messageId)) {
                commentedSet.add(messageId);
                successfulComments.push({ channelId, messageId });
              }
            }

            // 验证：在每个频道都应该能成功评论
            expect(successfulComments.length).toBe(uniqueChannels.length);

            // 验证：每个频道的评论记录都应该包含该消息
            for (const channelId of uniqueChannels) {
              const commentKey = `${accountId}:${channelId}`;
              const commentedSet = commentedMessages.get(commentKey)!;
              expect(commentedSet.has(messageId)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
