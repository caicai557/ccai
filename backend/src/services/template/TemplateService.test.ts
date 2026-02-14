import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { createTables } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

describe('TemplateService', () => {
  let db: Database.Database;
  let service: TemplateService;

  beforeEach(() => {
    // 创建内存数据库
    db = new Database(':memory:');
    createTables(db);
    runMigrations(db);
    service = new TemplateService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('createTemplate', () => {
    it('应该成功创建模板', async () => {
      const input = {
        category: 'group_message' as const,
        content: '测试消息',
        weight: 1,
      };

      const template = await service.createTemplate(input);

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.category).toBe('group_message');
      expect(template.content).toBe('测试消息');
      expect(template.weight).toBe(1);
    });

    it('应该拒绝空内容', async () => {
      const input = {
        category: 'group_message' as const,
        content: '',
      };

      await expect(service.createTemplate(input)).rejects.toThrow('模板内容不能为空');
    });

    it('应该拒绝无效的分类', async () => {
      const input = {
        category: 'invalid' as any,
        content: '测试消息',
      };

      await expect(service.createTemplate(input)).rejects.toThrow('无效的模板分类');
    });
  });

  describe('updateTemplate', () => {
    it('应该成功更新模板', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '原始内容',
      });

      const updated = await service.updateTemplate(template.id, {
        content: '更新后的内容',
      });

      expect(updated.content).toBe('更新后的内容');
    });

    it('应该拒绝更新不存在的模板', async () => {
      await expect(service.updateTemplate('non-existent', { content: '新内容' })).rejects.toThrow(
        '模板不存在'
      );
    });
  });

  describe('deleteTemplate', () => {
    it('应该成功删除模板', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      await service.deleteTemplate(template.id);

      const deleted = await service.getTemplate(template.id);
      expect(deleted).toBeNull();
    });

    it('应该拒绝删除不存在的模板', async () => {
      await expect(service.deleteTemplate('non-existent')).rejects.toThrow('模板不存在');
    });
  });

  describe('generateContent', () => {
    it('应该生成内容并替换变量', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '当前时间: {time}, 日期: {date}, 随机数: {random}',
      });

      const content = await service.generateContent(template.id);

      expect(content).toBeDefined();
      expect(content).not.toContain('{time}');
      expect(content).not.toContain('{date}');
      expect(content).not.toContain('{random}');
      expect(content).toMatch(/当前时间: \d{2}:\d{2}/);
      expect(content).toMatch(/日期: \d{4}-\d{2}-\d{2}/);
      expect(content).toMatch(/随机数: \d+/);
    });

    it('应该从多行内容中随机选择一行', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '消息1\n消息2\n消息3',
      });

      const content = await service.generateContent(template.id);

      expect(['消息1', '消息2', '消息3']).toContain(content);
    });

    it('应该递增使用计数', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      await service.generateContent(template.id);
      await service.generateContent(template.id);

      const count = await service.getUsageCount(template.id);
      expect(count).toBe(2);
    });

    it('应该拒绝生成已禁用模板的内容', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      await service.updateTemplate(template.id, { enabled: false });

      await expect(service.generateContent(template.id)).rejects.toThrow('模板已禁用');
    });
  });

  describe('previewTemplate', () => {
    it('应该预览单行内容', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息 {time}',
      });

      const previews = await service.previewTemplate(template.id);

      expect(previews).toHaveLength(1);
      expect(previews[0]).not.toContain('{time}');
      expect(previews[0]).toMatch(/测试消息 \d{2}:\d{2}/);
    });

    it('应该预览多行内容', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '消息1 {time}\n消息2 {date}\n消息3 {random}',
      });

      const previews = await service.previewTemplate(template.id);

      expect(previews).toHaveLength(3);
      expect(previews[0]).toMatch(/消息1 \d{2}:\d{2}/);
      expect(previews[1]).toMatch(/消息2 \d{4}-\d{2}-\d{2}/);
      expect(previews[2]).toMatch(/消息3 \d+/);
    });
  });

  describe('isTemplateReferenced', () => {
    it('应该检测到模板被任务引用', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      // 创建一个引用该模板的任务
      db.prepare(
        `
        INSERT INTO tasks (id, type, account_ids, target_ids, config, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        'task-1',
        'group_posting',
        '["acc-1"]',
        '["target-1"]',
        JSON.stringify({ templateId: template.id }),
        'stopped'
      );

      const isReferenced = await service.isTemplateReferenced(template.id);
      expect(isReferenced).toBe(true);
    });

    it('应该检测到模板未被引用', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      const isReferenced = await service.isTemplateReferenced(template.id);
      expect(isReferenced).toBe(false);
    });

    it('应该阻止删除被引用的模板', async () => {
      const template = await service.createTemplate({
        category: 'group_message',
        content: '测试消息',
      });

      // 创建一个引用该模板的任务
      db.prepare(
        `
        INSERT INTO tasks (id, type, account_ids, target_ids, config, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        'task-1',
        'group_posting',
        '["acc-1"]',
        '["target-1"]',
        JSON.stringify({ templateId: template.id }),
        'stopped'
      );

      await expect(service.deleteTemplate(template.id)).rejects.toThrow(
        '模板正在被任务使用，无法删除'
      );
    });
  });

  describe('getTemplatesByCategory', () => {
    it('应该按分类获取模板', async () => {
      await service.createTemplate({
        category: 'group_message',
        content: '群组消息1',
      });
      await service.createTemplate({
        category: 'group_message',
        content: '群组消息2',
      });
      await service.createTemplate({
        category: 'channel_comment',
        content: '频道评论1',
      });

      const groupTemplates = await service.getTemplatesByCategory('group_message');
      const commentTemplates = await service.getTemplatesByCategory('channel_comment');

      expect(groupTemplates).toHaveLength(2);
      expect(commentTemplates).toHaveLength(1);
    });
  });
});
