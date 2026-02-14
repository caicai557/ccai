import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Space,
  message,
  Divider,
  Alert,
} from 'antd';
import type { Task, CreateTaskRequest, TaskConfig } from '../../types/task';
import { tasksApi } from '../../services/api/tasks';
import { accountsApi } from '../../services/api/accounts';
import { targetsApi } from '../../services/api/targets';
import { templatesApi } from '../../services/api/templates';
import type { Account } from '../../types/account';
import type { Target } from '../../types/target';
import type { Template } from '../../types/template';
import { validation } from '../../utils';
import { FormFieldTooltip } from '../Common';

const { Option } = Select;

interface TaskFormProps {
  visible: boolean;
  task?: Task | null; // 如果提供task，则为编辑模式
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 任务创建/编辑表单
 */
export const TaskForm: React.FC<TaskFormProps> = ({ visible, task, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [taskType, setTaskType] = useState<'send_message' | 'auto_comment'>('send_message');
  const [targetType, setTargetType] = useState<'group' | 'channel'>('group');

  const isEditMode = !!task;

  // 加载账号列表
  const loadAccounts = async () => {
    try {
      const data = await accountsApi.getAll();
      setAccounts(data.filter((acc) => acc.status === 'online'));
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  // 加载目标列表
  const loadTargets = async () => {
    try {
      const data = await targetsApi.getAll();
      setTargets(data.filter((target) => target.enabled));
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  // 加载模板列表
  const loadTemplates = async () => {
    try {
      const data = await templatesApi.getAll();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  // 根据任务类型过滤模板
  const getFilteredTemplates = () => {
    if (taskType === 'send_message') {
      return templates.filter((t) => t.category === 'group_message');
    } else {
      return templates.filter((t) => t.category === 'channel_comment');
    }
  };

  // 根据目标类型过滤目标
  const getFilteredTargets = () => {
    return targets.filter((t) => t.type === targetType);
  };

  // 初始化表单
  useEffect(() => {
    if (visible) {
      loadAccounts();
      loadTargets();
      loadTemplates();

      if (task) {
        // 编辑模式：填充表单
        setTaskType(task.type);
        setTargetType(task.targetType);
        form.setFieldsValue({
          name: task.name,
          type: task.type,
          accountId: task.accountId,
          targetType: task.targetType,
          targetId: task.targetId,
          templateId: task.templateId,
          priority: task.priority,
          interval: task.config.interval,
          commentProbability: task.config.commentProbability
            ? task.config.commentProbability * 100
            : undefined,
          minDelay: task.config.minDelay,
          maxDelay: task.config.maxDelay,
          retryOnError: task.config.retryOnError ?? true,
          maxRetries: task.config.maxRetries ?? 3,
        });
      } else {
        // 创建模式：设置默认值
        form.setFieldsValue({
          type: 'send_message',
          targetType: 'group',
          priority: 5,
          interval: 10,
          commentProbability: 50,
          minDelay: 1,
          maxDelay: 3,
          retryOnError: true,
          maxRetries: 3,
        });
      }
    } else {
      form.resetFields();
    }
  }, [visible, task]);

  // 处理任务类型变化
  const handleTaskTypeChange = (value: 'send_message' | 'auto_comment') => {
    setTaskType(value);
    form.setFieldValue('templateId', undefined);
  };

  // 处理目标类型变化
  const handleTargetTypeChange = (value: 'group' | 'channel') => {
    setTargetType(value);
    form.setFieldValue('targetId', undefined);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // 构建配置对象
      const config: TaskConfig = {
        retryOnError: values.retryOnError,
        maxRetries: values.maxRetries,
        minDelay: values.minDelay,
        maxDelay: values.maxDelay,
      };

      if (values.type === 'send_message') {
        config.interval = values.interval;
      } else {
        config.commentProbability = values.commentProbability / 100;
      }

      if (isEditMode && task) {
        // 编辑模式
        await tasksApi.update(task.id, {
          config,
          priority: values.priority,
        });
        message.success('任务更新成功');
      } else {
        // 创建模式
        const createData: CreateTaskRequest = {
          name: values.name,
          type: values.type,
          accountId: values.accountId,
          targetId: values.targetId,
          targetType: values.targetType,
          templateId: values.templateId,
          config,
          priority: values.priority,
        };
        await tasksApi.create(createData);
        message.success('任务创建成功');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(isEditMode ? '更新任务失败' : '创建任务失败');
        console.error('Failed to save task:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEditMode ? '编辑任务' : '创建任务'}
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={700}
      destroyOnClose
    >
      <Form form={form} layout="vertical" autoComplete="off">
        {/* 基本信息 */}
        <Divider orientation="left">基本信息</Divider>

        <Form.Item
          name="name"
          label={
            <>
              任务名称
              <FormFieldTooltip title="为任务设置一个易于识别的名称" />
            </>
          }
          rules={[
            validation.required('请输入任务名称'),
            validation.minLength(2, '任务名称至少2个字符'),
            validation.maxLength(50, '任务名称最多50个字符'),
            validation.noWhitespaceOnly(),
          ]}
        >
          <Input placeholder="请输入任务名称" disabled={isEditMode} />
        </Form.Item>

        <Space style={{ width: '100%' }} size="large">
          <Form.Item
            name="type"
            label="任务类型"
            rules={[{ required: true, message: '请选择任务类型' }]}
            style={{ width: 200 }}
          >
            <Select
              placeholder="选择任务类型"
              onChange={handleTaskTypeChange}
              disabled={isEditMode}
            >
              <Option value="send_message">消息发送</Option>
              <Option value="auto_comment">自动评论</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="priority"
            label={
              <>
                优先级
                <FormFieldTooltip title="数字越大优先级越高，范围1-10" />
              </>
            }
            rules={[validation.required('请设置优先级'), validation.numberRange(1, 10)]}
            style={{ width: 150 }}
          >
            <InputNumber min={1} max={10} placeholder="1-10" style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        {/* 账号和目标 */}
        <Divider orientation="left">账号和目标</Divider>

        <Form.Item
          name="accountId"
          label="使用账号"
          rules={[{ required: true, message: '请选择账号' }]}
        >
          <Select placeholder="选择账号" disabled={isEditMode}>
            {accounts.map((account) => (
              <Option key={account.id} value={account.id}>
                {account.phoneNumber} - {account.firstName || account.username || '未命名'}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Space style={{ width: '100%' }} size="large">
          <Form.Item
            name="targetType"
            label="目标类型"
            rules={[{ required: true, message: '请选择目标类型' }]}
            style={{ width: 200 }}
          >
            <Select
              placeholder="选择目标类型"
              onChange={handleTargetTypeChange}
              disabled={isEditMode}
            >
              <Option value="group">群组</Option>
              <Option value="channel">频道</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="targetId"
            label="目标"
            rules={[{ required: true, message: '请选择目标' }]}
            style={{ flex: 1 }}
          >
            <Select placeholder="选择目标" disabled={isEditMode}>
              {getFilteredTargets().map((target) => (
                <Option key={target.id} value={target.id}>
                  {target.title}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Space>

        <Form.Item
          name="templateId"
          label="消息模板"
          rules={[{ required: true, message: '请选择模板' }]}
        >
          <Select placeholder="选择模板" disabled={isEditMode}>
            {getFilteredTemplates().map((template) => (
              <Option key={template.id} value={template.id}>
                {template.name || template.content || template.id}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 任务参数 */}
        <Divider orientation="left">任务参数</Divider>

        {taskType === 'send_message' && (
          <Form.Item
            name="interval"
            label={
              <>
                发送间隔（分钟）
                <FormFieldTooltip title="两次消息发送之间的时间间隔，最少10分钟" />
              </>
            }
            rules={[
              validation.required('请设置发送间隔'),
              validation.numberRange(10, 1440, '发送间隔必须在10-1440分钟之间'),
            ]}
            extra="两次消息发送之间的时间间隔，最少10分钟"
          >
            <InputNumber
              min={10}
              max={1440}
              placeholder="10-1440"
              style={{ width: '100%' }}
              addonAfter="分钟"
            />
          </Form.Item>
        )}

        {taskType === 'auto_comment' && (
          <Form.Item
            name="commentProbability"
            label={
              <>
                评论概率（%）
                <FormFieldTooltip title="新消息被评论的概率，0表示不评论，100表示全部评论" />
              </>
            }
            rules={[validation.required('请设置评论概率'), validation.percentage()]}
            extra="新消息被评论的概率，0表示不评论，100表示全部评论"
          >
            <InputNumber
              min={0}
              max={100}
              placeholder="0-100"
              style={{ width: '100%' }}
              addonAfter="%"
            />
          </Form.Item>
        )}

        <Space style={{ width: '100%' }} size="large">
          <Form.Item
            name="minDelay"
            label={
              <>
                最小延迟（秒）
                <FormFieldTooltip title="操作前随机等待的最小时间" />
              </>
            }
            rules={[
              validation.required('请设置最小延迟'),
              validation.numberRange(1, 300, '延迟必须在1-300秒之间'),
            ]}
            style={{ width: 200 }}
          >
            <InputNumber
              min={1}
              max={300}
              placeholder="1-300"
              style={{ width: '100%' }}
              addonAfter="秒"
            />
          </Form.Item>

          <Form.Item
            name="maxDelay"
            label={
              <>
                最大延迟（秒）
                <FormFieldTooltip title="操作前随机等待的最大时间" />
              </>
            }
            rules={[
              validation.required('请设置最大延迟'),
              validation.numberRange(1, 300, '延迟必须在1-300秒之间'),
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const minDelay = getFieldValue('minDelay');
                  if (!value || value >= minDelay) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('最大延迟必须大于等于最小延迟'));
                },
              }),
            ]}
            style={{ width: 200 }}
          >
            <InputNumber
              min={1}
              max={300}
              placeholder="1-300"
              style={{ width: '100%' }}
              addonAfter="秒"
            />
          </Form.Item>
        </Space>

        <Alert
          message="随机延迟说明"
          description="每次操作前会在最小延迟和最大延迟之间随机等待，模拟真人操作"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* 重试设置 */}
        <Divider orientation="left">重试设置</Divider>

        <Form.Item name="retryOnError" label="失败时自动重试" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues.retryOnError !== currentValues.retryOnError
          }
        >
          {({ getFieldValue }) =>
            getFieldValue('retryOnError') && (
              <Form.Item
                name="maxRetries"
                label={
                  <>
                    最大重试次数
                    <FormFieldTooltip title="失败后最多重试的次数" />
                  </>
                }
                rules={[
                  validation.required('请设置最大重试次数'),
                  validation.numberRange(1, 10, '重试次数必须在1-10次之间'),
                ]}
              >
                <InputNumber
                  min={1}
                  max={10}
                  placeholder="1-10"
                  style={{ width: '100%' }}
                  addonAfter="次"
                />
              </Form.Item>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
};
