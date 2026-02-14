import { TemplateDao } from '../../database/dao/TemplateDao';
import { Template } from '../../types';
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';

/**
 * 模板输入数据
 */
export interface TemplateInput {
  category: 'group_message' | 'channel_comment';
  content: string;
  weight?: number;
}

/**
 * 模板服务类
 * 负责模板的创建、更新、删除和内容生成
 */
export class TemplateService {
  private templateDao: TemplateDao;

  constructor(db: Database.Database) {
    this.templateDao = new TemplateDao(db);
  }

  /**
   * 创建模板
   * @param input 模板输入数据
   * @returns 创建的模板
   */
  async createTemplate(input: TemplateInput): Promise<Template> {
    // 验证必需字段
    if (!input.content || input.content.trim() === '') {
      throw new Error('模板内容不能为空');
    }

    if (!input.category) {
      throw new Error('模板分类不能为空');
    }

    if (!['group_message', 'channel_comment'].includes(input.category)) {
      throw new Error('无效的模板分类');
    }

    logger.info(`创建模板: category=${input.category}`);

    const template = this.templateDao.create({
      category: input.category,
      content: input.content,
      weight: input.weight || 1,
      enabled: true,
    });

    logger.info(`模板创建成功: id=${template.id}`);
    return template;
  }

  /**
   * 更新模板
   * @param templateId 模板ID
   * @param input 更新的数据
   * @returns 更新后的模板
   */
  async updateTemplate(templateId: string, input: Partial<TemplateInput>): Promise<Template> {
    const existing = this.templateDao.findById(templateId);
    if (!existing) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    // 验证内容
    if (input.content !== undefined && input.content.trim() === '') {
      throw new Error('模板内容不能为空');
    }

    // 验证分类
    if (
      input.category !== undefined &&
      !['group_message', 'channel_comment'].includes(input.category)
    ) {
      throw new Error('无效的模板分类');
    }

    logger.info(`更新模板: id=${templateId}`);

    const updated = this.templateDao.update(templateId, input);
    if (!updated) {
      throw new Error(`更新模板失败: ${templateId}`);
    }

    logger.info(`模板更新成功: id=${templateId}`);
    return updated;
  }

  /**
   * 删除模板
   * @param templateId 模板ID
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const existing = this.templateDao.findById(templateId);
    if (!existing) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    // 检查模板是否被任务引用
    const isReferenced = await this.isTemplateReferenced(templateId);
    if (isReferenced) {
      throw new Error(`模板正在被任务使用，无法删除: ${templateId}`);
    }

    logger.info(`删除模板: id=${templateId}`);

    const deleted = this.templateDao.delete(templateId);
    if (!deleted) {
      throw new Error(`删除模板失败: ${templateId}`);
    }

    logger.info(`模板删除成功: id=${templateId}`);
  }

  /**
   * 检查模板是否被任务引用
   * @param templateId 模板ID
   * @returns 是否被引用
   */
  async isTemplateReferenced(templateId: string): Promise<boolean> {
    // 查询所有任务的config字段，检查是否包含该模板ID
    const stmt = this.templateDao['db'].prepare('SELECT config FROM tasks');
    const tasks = stmt.all() as { config: string }[];

    for (const task of tasks) {
      try {
        const config = JSON.parse(task.config);
        if (config.templateId === templateId) {
          return true;
        }
      } catch (error) {
        logger.warn('解析任务配置失败', error);
      }
    }

    return false;
  }

  /**
   * 递增模板使用计数
   * @param templateId 模板ID
   */
  async incrementUsageCount(templateId: string): Promise<void> {
    const template = this.templateDao.findById(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    this.templateDao.incrementUsageCount(templateId);
    logger.debug(`模板使用计数递增: id=${templateId}`);
  }

  /**
   * 获取模板使用计数
   * @param templateId 模板ID
   * @returns 使用计数
   */
  async getUsageCount(templateId: string): Promise<number> {
    return this.templateDao.getUsageCount(templateId);
  }

  /**
   * 获取所有模板
   * @returns 模板列表
   */
  async getAllTemplates(): Promise<Template[]> {
    return this.templateDao.findAll();
  }

  /**
   * 获取模板详情
   * @param templateId 模板ID
   * @returns 模板或null
   */
  async getTemplate(templateId: string): Promise<Template | null> {
    const template = this.templateDao.findById(templateId);
    return template || null;
  }

  /**
   * 根据分类获取模板
   * @param category 模板分类
   * @returns 模板列表
   */
  async getTemplatesByCategory(category: 'group_message' | 'channel_comment'): Promise<Template[]> {
    return this.templateDao.findByCategory(category);
  }

  /**
   * 获取启用的模板
   * @param category 可选的分类过滤
   * @returns 启用的模板列表
   */
  async getEnabledTemplates(category?: string): Promise<Template[]> {
    return this.templateDao.findEnabled(category);
  }

  /**
   * 从模板生成消息内容
   * @param templateId 模板ID
   * @returns 生成的内容
   */
  async generateContent(templateId: string): Promise<string> {
    const template = this.templateDao.findById(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    if (!template.enabled) {
      throw new Error(`模板已禁用: ${templateId}`);
    }

    // 从内容中随机选择一条
    const selectedContent = this.selectRandomContent(template.content);

    // 应用变量替换
    const content = this.replaceVariables(selectedContent);

    // 递增使用计数
    this.templateDao.incrementUsageCount(templateId);

    logger.debug(`生成内容: templateId=${templateId}`);
    return content;
  }

  /**
   * 从内容中随机选择一条
   * 内容可以是单行或多行（用换行符分隔）
   * @param content 模板内容
   * @returns 随机选择的一条内容
   */
  private selectRandomContent(content: string): string {
    // 按换行符分割内容
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return content;
    }

    // 随机选择一条
    const randomIndex = Math.floor(Math.random() * lines.length);
    return lines[randomIndex] ?? content;
  }

  /**
   * 替换内容中的变量
   * 支持的变量:
   * - {time}: 当前时间 (HH:mm 格式)
   * - {date}: 当前日期 (YYYY-MM-DD 格式)
   * - {random}: 随机数 (1-100)
   * @param content 原始内容
   * @returns 替换后的内容
   */
  private replaceVariables(content: string): string {
    let result = content;

    // 替换 {time}
    result = result.replace(/\{time\}/g, () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    });

    // 替换 {date}
    result = result.replace(/\{date\}/g, () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });

    // 替换 {random}
    result = result.replace(/\{random\}/g, () => {
      return String(Math.floor(Math.random() * 100) + 1);
    });

    return result;
  }

  /**
   * 预览模板效果
   * 显示所有可能的内容变体（如果有多行）以及变量替换后的效果
   * @param templateId 模板ID
   * @returns 预览内容数组
   */
  async previewTemplate(templateId: string): Promise<string[]> {
    const template = this.templateDao.findById(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    // 按换行符分割内容，获取所有可能的内容变体
    const lines = template.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // 如果没有内容，返回原始内容
    if (lines.length === 0) {
      return [this.replaceVariables(template.content)];
    }

    // 对每一行内容应用变量替换
    const previews = lines.map((line) => this.replaceVariables(line));

    logger.debug(`预览模板: templateId=${templateId}, variants=${previews.length}`);
    return previews;
  }
}
