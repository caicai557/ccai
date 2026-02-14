/**
 * API端点集成测试
 * 测试所有REST API端点的基本功能
 */
import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { DaoFactory } from '../../database/dao';
import { runMigrations } from '../../database/migrations';
import { closeDatabase } from '../../database/init';
import { ClientPool } from '../../telegram/ClientPool';
import { wsManager } from '../ws';

describe('API端点集成测试', () => {
  let app: express.Application;
  let testDbPath: string;
  let db: Database.Database;

  beforeAll(async () => {
    // 创建测试数据库
    testDbPath = path.join(__dirname, '../../../data/test-api.db');
    process.env['DATABASE_PATH'] = testDbPath;

    // 确保测试数据库目录存在
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 删除旧的测试数据库
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // 创建数据库连接
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');

    // 先创建schema
    const { createTables } = await import('../../database/schema');
    createTables(db);

    // 再运行迁移
    await runMigrations(db);

    // 初始化DAO工厂
    DaoFactory.initialize(db);

    // 延迟导入app以确保数据库已初始化
    const { createApp } = await import('../../app');
    app = createApp();
  });

  afterAll(() => {
    // 停止后台定时任务，避免Jest open handles
    ClientPool.getInstance().stopBackgroundTasks();
    wsManager.close();

    // 关闭应用层数据库单例连接
    closeDatabase();

    // 关闭数据库连接
    if (db) {
      db.close();
    }

    // 清理测试数据库
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    delete process.env['DATABASE_PATH'];
  });

  describe('健康检查端点', () => {
    test('GET /health 应该返回200', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  describe('配置管理API', () => {
    test('GET /api/config 应该返回配置', async () => {
      const response = await request(app).get('/api/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    test('PUT /api/config 应该更新配置', async () => {
      const response = await request(app).put('/api/config').send({
        'rate_limit.max_per_hour': '25',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('POST /api/config/reset 应该重置配置', async () => {
      const response = await request(app).post('/api/config/reset');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('模板管理API', () => {
    let templateId: string;

    test('POST /api/templates 应该创建模板', async () => {
      const response = await request(app).post('/api/templates').send({
        category: 'group_message',
        content: '测试内容1',
        weight: 1,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('template');
      expect(response.body.data.template).toHaveProperty('id');

      templateId = response.body.data.template.id;
    });

    test('GET /api/templates 应该返回模板列表', async () => {
      const response = await request(app).get('/api/templates');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data.templates)).toBe(true);
    });

    test('GET /api/templates/:id 应该返回模板详情', async () => {
      const response = await request(app).get(`/api/templates/${templateId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('template');
      expect(response.body.data.template).toHaveProperty('id', templateId);
    });

    test('GET /api/templates/:id/preview 应该返回模板预览', async () => {
      const response = await request(app).get(`/api/templates/${templateId}/preview`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data.previews)).toBe(true);
    });

    test('PUT /api/templates/:id 应该更新模板', async () => {
      const response = await request(app).put(`/api/templates/${templateId}`).send({
        content: '更新后的模板内容',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('template');
      expect(response.body.data.template).toHaveProperty('id', templateId);
    });

    test('DELETE /api/templates/:id 应该删除模板', async () => {
      const response = await request(app).delete(`/api/templates/${templateId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('message');
    });
  });

  describe('目标管理API', () => {
    let targetId: string;

    test('POST /api/targets 应该创建目标', async () => {
      const response = await request(app).post('/api/targets').send({
        type: 'group',
        telegramId: '-1001234567890',
        title: '测试群组',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('target');
      expect(response.body.data.target).toHaveProperty('id');

      targetId = response.body.data.target.id;
    });

    test('GET /api/targets 应该返回目标列表', async () => {
      const response = await request(app).get('/api/targets');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data.targets)).toBe(true);
    });

    test('GET /api/targets/:id 应该返回目标详情', async () => {
      const response = await request(app).get(`/api/targets/${targetId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('target');
      expect(response.body.data.target).toHaveProperty('id', targetId);
    });

    test('DELETE /api/targets/:id 应该删除目标', async () => {
      const response = await request(app).delete(`/api/targets/${targetId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('message');
    });
  });

  describe('日志管理API', () => {
    test('GET /api/logs 应该返回日志列表', async () => {
      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data.logs)).toBe(true);
    });

    test('GET /api/logs 应该支持过滤参数', async () => {
      const response = await request(app).get('/api/logs').query({
        level: 'INFO',
        limit: 10,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('统计API', () => {
    test('GET /api/stats/dashboard 应该返回仪表板统计', async () => {
      const response = await request(app).get('/api/stats/dashboard');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('accounts');
      expect(response.body.data).toHaveProperty('tasks');
      expect(response.body.data).toHaveProperty('executions');
      expect(response.body.data).toHaveProperty('logs');
    });

    test('GET /api/stats/accounts 应该返回账号统计', async () => {
      const response = await request(app).get('/api/stats/accounts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('statusDistribution');
    });

    test('GET /api/stats/tasks 应该返回任务统计', async () => {
      const response = await request(app).get('/api/stats/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('statusDistribution');
    });
  });

  describe('错误处理', () => {
    test('访问不存在的端点应该返回404', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
    });

    test('访问不存在的资源应该返回404', async () => {
      const response = await request(app).get('/api/templates/nonexistent-id');

      expect(response.status).toBe(404);
    });

    test('无效的请求体应该返回400', async () => {
      const response = await request(app).post('/api/templates').send({
        // 缺少必需字段
      });

      expect(response.status).toBe(400);
    });
  });
});
