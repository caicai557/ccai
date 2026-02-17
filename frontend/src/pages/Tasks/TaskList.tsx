import { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  message,
  Popconfirm,
  Tooltip,
  Badge,
  Tabs,
  Modal,
  Form,
  Select,
  InputNumber,
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ReloadOutlined,
  HistoryOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTaskStore } from '../../stores/task';
import { tasksApi } from '../../services/api/tasks';
import { discoveryApi } from '../../services/api/discovery';
import { accountsApi } from '../../services/api/accounts';
import { templatesApi } from '../../services/api/templates';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WsMessageType } from '../../services/websocket/client';
import type { Task, TaskDraft } from '../../types/task';
import { PageHeader } from '../../components/Layout';
import { TaskForm, TaskHistoryModal } from '../../components/Task';
import { showError } from '../../utils/notification';
import type { Account } from '../../types/account';
import type { Template } from '../../types/template';

/**
 * 任务列表页面
 */
const TaskList: React.FC = () => {
  const [confirmForm] = Form.useForm();
  const { tasks, setTasks, updateTask, removeTask, setLoading, loading } = useTaskStore();
  const [refreshing, setRefreshing] = useState(false);
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null);
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'drafts'>('tasks');
  const [taskDraftsEnabled, setTaskDraftsEnabled] = useState(true);
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<'pending' | 'confirmed' | 'rejected' | undefined>(
    'pending'
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<TaskDraft | null>(null);
  const [rejectingDraftId, setRejectingDraftId] = useState<string | null>(null);

  // WebSocket 实时更新任务状态
  useWebSocket(
    WsMessageType.TASK_STATUS,
    (data: any) => {
      if (data.taskId) {
        updateTask(data.taskId, {
          status: data.status,
          nextExecutionAt: data.nextExecutionAt ? new Date(data.nextExecutionAt) : undefined,
          lastExecutedAt: data.lastExecutedAt ? new Date(data.lastExecutedAt) : undefined,
          successCount: data.successCount,
          failureCount: data.failureCount,
        });
      }
    },
    [updateTask]
  );

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      showError('加载任务列表失败');
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDrafts = async () => {
    try {
      setDraftLoading(true);
      const data = await discoveryApi.listTaskDrafts({
        status: draftStatusFilter,
        page: 1,
        pageSize: 100,
      });
      setDrafts(data.items);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载任务草稿失败';
      if (errorMessage.includes('任务草稿功能未开启')) {
        setTaskDraftsEnabled(false);
        if (activeTab === 'drafts') {
          setActiveTab('tasks');
        }
        return;
      }
      showError(errorMessage || '加载任务草稿失败');
      console.error('Failed to load task drafts:', error);
    } finally {
      setDraftLoading(false);
    }
  };

  const loadAccountsAndTemplates = async () => {
    try {
      const [accountList, templateList] = await Promise.all([accountsApi.getAll(), templatesApi.getAll()]);
      setAccounts(accountList);
      setTemplates(templateList);
    } catch (error) {
      console.error('Failed to load confirm options:', error);
    }
  };

  // 刷新任务列表
  const handleRefresh = async () => {
    setRefreshing(true);
    const jobs: Array<Promise<void>> = [loadTasks()];
    if (taskDraftsEnabled) {
      jobs.push(loadDrafts());
    }
    await Promise.all(jobs);
    setRefreshing(false);
    message.success('刷新成功');
  };

  // 启动任务
  const handleStart = async (taskId: string) => {
    try {
      setOperatingTaskId(taskId);
      const startResult = await tasksApi.start(taskId);
      updateTask(taskId, { status: 'running' });

      const readyCount = startResult.precheck.readyPairs.length;
      const blockedCount = startResult.precheck.blockedPairs.length;
      const reasonText = Object.entries(startResult.precheck.blockedReasons || {})
        .map(([code, count]) => `${code}(${count})`)
        .join('、');

      if (blockedCount > 0) {
        message.warning(
          `任务已启动（部分可用）：可用${readyCount}，阻塞${blockedCount}${reasonText ? `，原因：${reasonText}` : ''}`
        );
      } else {
        message.success(startResult.message || '任务启动成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '启动任务失败';
      message.error(errorMessage || '启动任务失败');
      console.error('Failed to start task:', error);
    } finally {
      setOperatingTaskId(null);
    }
  };

  // 停止任务
  const handleStop = async (taskId: string) => {
    try {
      setOperatingTaskId(taskId);
      await tasksApi.stop(taskId);
      updateTask(taskId, { status: 'stopped' });
      message.success('任务停止成功');
    } catch (error) {
      message.error('停止任务失败');
      console.error('Failed to stop task:', error);
    } finally {
      setOperatingTaskId(null);
    }
  };

  // 暂停任务（后端语义等同停止）
  const handlePause = async (taskId: string) => {
    try {
      setOperatingTaskId(taskId);
      await tasksApi.pause(taskId);
      updateTask(taskId, { status: 'stopped' });
      message.success('任务已暂停（状态已置为停止）');
    } catch (error) {
      message.error('暂停任务失败');
      console.error('Failed to pause task:', error);
    } finally {
      setOperatingTaskId(null);
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string) => {
    try {
      await tasksApi.delete(taskId);
      removeTask(taskId);
      message.success('任务删除成功');
    } catch (error) {
      message.error('删除任务失败');
      console.error('Failed to delete task:', error);
    }
  };

  // 查看执行历史
  const handleViewHistory = (taskId: string) => {
    setHistoryTaskId(taskId);
    setHistoryModalVisible(true);
  };

  // 关闭执行历史对话框
  const handleHistoryModalClose = () => {
    setHistoryModalVisible(false);
    setHistoryTaskId(null);
  };

  // 编辑任务
  const handleEdit = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setEditingTask(task);
      setTaskFormVisible(true);
    }
  };

  // 创建任务
  const handleCreate = () => {
    setEditingTask(null);
    setTaskFormVisible(true);
  };

  // 任务表单关闭
  const handleTaskFormClose = () => {
    setTaskFormVisible(false);
    setEditingTask(null);
  };

  // 任务表单成功
  const handleTaskFormSuccess = () => {
    loadTasks();
  };

  const openConfirmDraftModal = (draft: TaskDraft) => {
    const category = draft.taskType === 'group_posting' ? 'group_message' : 'channel_comment';
    const matchedTemplates = templates.filter(
      (template) => template.category === category && template.enabled !== false
    );
    const defaultTemplateId =
      draft.templateId ||
      matchedTemplates[0]?.id ||
      templates.find((template) => template.enabled !== false)?.id;

    confirmForm.setFieldsValue({
      accountIds: draft.accountIds,
      templateId: defaultTemplateId,
      priority: draft.priority,
      interval: draft.config.interval ?? 10,
      randomDelay: draft.config.randomDelay ?? 1,
      commentProbability: Math.round((draft.config.commentProbability ?? 0.5) * 100),
      retryOnError: draft.config.retryOnError ?? true,
      maxRetries: draft.config.maxRetries ?? 3,
      autoJoinEnabled: draft.config.autoJoinEnabled ?? true,
      precheckPolicy: draft.config.precheckPolicy ?? 'partial',
    });
    setConfirmingDraftId(draft.id);
    setConfirmingDraft(draft);
    setConfirmModalVisible(true);
  };

  const handleConfirmDraft = async () => {
    if (!confirmingDraftId) {
      return;
    }

    try {
      const values = await confirmForm.validateFields();
      const payload = {
        accountIds: values.accountIds,
        templateId: values.templateId,
          priority: values.priority,
          config: {
            interval: values.interval,
            randomDelay: values.randomDelay,
            commentProbability:
              values.commentProbability !== undefined && values.commentProbability !== null
                ? Number(values.commentProbability) / 100
                : undefined,
            retryOnError: values.retryOnError,
            maxRetries: values.maxRetries,
            autoJoinEnabled: values.autoJoinEnabled,
          precheckPolicy: values.precheckPolicy,
        },
      };

      await discoveryApi.confirmTaskDraft(confirmingDraftId, payload);
      message.success('草稿确认成功，任务已创建');
      setConfirmModalVisible(false);
      setConfirmingDraftId(null);
      setConfirmingDraft(null);
      confirmForm.resetFields();
      await Promise.all([loadDrafts(), loadTasks()]);
    } catch (error) {
      if ((error as any)?.errorFields) {
        message.error('请先完成表单必填项');
        return;
      }
      showError((error as Error).message || '确认草稿失败');
    }
  };

  const handleRejectDraft = async (draftId: string) => {
    try {
      setRejectingDraftId(draftId);
      await discoveryApi.rejectTaskDraft(draftId, '人工拒绝');
      message.success('草稿已拒绝');
      await loadDrafts();
    } catch (error) {
      showError((error as Error).message || '拒绝草稿失败');
    } finally {
      setRejectingDraftId(null);
    }
  };

  // 任务类型标签
  const renderTypeTag = (type: Task['type']) => {
    const typeConfig = {
      send_message: {
        color: 'blue',
        text: '消息发送',
      },
      auto_comment: {
        color: 'purple',
        text: '自动评论',
      },
    };

    const config = typeConfig[type];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 状态标签
  const renderStatusTag = (status: Task['status']) => {
    const statusConfig = {
      running: {
        color: 'success',
        text: '运行中',
      },
      stopped: {
        color: 'default',
        text: '已停止',
      },
    };

    const config = statusConfig[status];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 格式化时间
  const formatTime = (date?: Date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('zh-CN');
  };

  // 计算成功率
  const calculateSuccessRate = (task: Task): string => {
    const total = task.successCount + task.failureCount;
    if (total === 0) return '-';
    const rate = (task.successCount / total) * 100;
    return `${rate.toFixed(1)}%`;
  };

  // 表格列定义
  const columns: ColumnsType<Task> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type) => renderTypeTag(type),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => renderStatusTag(status),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
    },
    {
      title: '执行统计',
      key: 'stats',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>
            成功: <Badge count={record.successCount} showZero color="green" />
          </span>
          <span>
            失败: <Badge count={record.failureCount} showZero color="red" />
          </span>
          <span>成功率: {calculateSuccessRate(record)}</span>
        </Space>
      ),
    },
    {
      title: '最后执行',
      dataIndex: 'lastExecutedAt',
      key: 'lastExecutedAt',
      width: 180,
      render: (date) => formatTime(date),
    },
    {
      title: '下次执行',
      dataIndex: 'nextExecutionAt',
      key: 'nextExecutionAt',
      width: 180,
      render: (date, record) => {
        if (record.status !== 'running') return '-';
        return formatTime(date);
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date) => formatTime(date),
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_, record) => {
        const isOperating = operatingTaskId === record.id;

        return (
          <Space size="small">
            {record.status === 'stopped' && (
              <Tooltip title="启动任务">
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleStart(record.id)}
                  loading={isOperating}
                >
                  启动
                </Button>
              </Tooltip>
            )}

            {record.status === 'running' && (
              <>
                <Tooltip title="暂停任务">
                  <Button
                    type="link"
                    size="small"
                    icon={<PauseCircleOutlined />}
                    onClick={() => handlePause(record.id)}
                    loading={isOperating}
                  >
                    暂停
                  </Button>
                </Tooltip>
                <Tooltip title="停止任务">
                  <Button
                    type="link"
                    size="small"
                    icon={<StopOutlined />}
                    onClick={() => handleStop(record.id)}
                    loading={isOperating}
                  >
                    停止
                  </Button>
                </Tooltip>
              </>
            )}

            <Tooltip title="查看历史">
              <Button
                type="link"
                size="small"
                icon={<HistoryOutlined />}
                onClick={() => handleViewHistory(record.id)}
              >
                历史
              </Button>
            </Tooltip>

            <Tooltip title="编辑任务">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record.id)}
                disabled={record.status === 'running'}
              >
                编辑
              </Button>
            </Tooltip>

            <Popconfirm
              title="确认删除"
              description="删除任务后将无法恢复，确定要删除吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={record.status === 'running'}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const draftColumns: ColumnsType<TaskDraft> = [
    {
      title: '草稿ID',
      dataIndex: 'id',
      key: 'id',
      width: 220,
      ellipsis: true,
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 140,
      render: (value: TaskDraft['sourceType']) => {
        const text =
          value === 'telegram_dialog_search'
            ? '账号可见'
            : value === 'telegram_global_search'
              ? '全局搜索'
              : '索引导航';
        return <Tag>{text}</Tag>;
      },
    },
    {
      title: '索引源',
      dataIndex: 'indexBotUsername',
      key: 'indexBotUsername',
      width: 140,
      render: (value?: string) => value || '-',
    },
    {
      title: '批次',
      dataIndex: 'runId',
      key: 'runId',
      width: 220,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      key: 'taskType',
      width: 120,
      render: (value: TaskDraft['taskType']) =>
        value === 'group_posting' ? <Tag color="blue">群发</Tag> : <Tag color="purple">频道监控</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: TaskDraft['status']) => {
        if (value === 'pending') {
          return <Tag color="processing">待确认</Tag>;
        }
        if (value === 'confirmed') {
          return <Tag color="success">已确认</Tag>;
        }
        return <Tag color="error">已拒绝</Tag>;
      },
    },
    {
      title: '确认任务ID',
      dataIndex: 'confirmedTaskId',
      key: 'confirmedTaskId',
      width: 220,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            disabled={record.status !== 'pending'}
            icon={<FileTextOutlined />}
            onClick={() => openConfirmDraftModal(record)}
          >
            确认
          </Button>
          <Popconfirm
            title="确认拒绝"
            description="拒绝后该草稿不可确认，确定继续吗？"
            onConfirm={() => handleRejectDraft(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.status !== 'pending'}
          >
            <Button
              type="link"
              size="small"
              danger
              disabled={record.status !== 'pending'}
              loading={rejectingDraftId === record.id}
            >
              拒绝
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 初始化加载
  useEffect(() => {
    loadTasks();
    if (taskDraftsEnabled) {
      loadDrafts();
    }
    loadAccountsAndTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (taskDraftsEnabled) {
      loadDrafts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStatusFilter, taskDraftsEnabled]);

  return (
    <div>
      <PageHeader
        title="任务管理"
        subTitle="管理自动化任务"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建任务
            </Button>
          </Space>
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'tasks' | 'drafts')}
        items={[
          {
            key: 'tasks',
            label: '任务列表',
            children: (
              <Table
                columns={columns}
                dataSource={tasks}
                rowKey="id"
                loading={loading}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 个任务`,
                }}
                scroll={{ x: 1600 }}
              />
            ),
          },
          ...(taskDraftsEnabled
            ? [
                {
                  key: 'drafts',
                  label: '任务草稿',
                  children: (
                    <>
                      <Space style={{ marginBottom: 12 }}>
                        <Select
                          allowClear
                          placeholder="草稿状态"
                          style={{ width: 160 }}
                          value={draftStatusFilter}
                          onChange={(value) => setDraftStatusFilter(value)}
                          options={[
                            { label: '待确认', value: 'pending' },
                            { label: '已确认', value: 'confirmed' },
                            { label: '已拒绝', value: 'rejected' },
                          ]}
                        />
                        <Button icon={<ReloadOutlined />} onClick={loadDrafts} loading={draftLoading}>
                          刷新草稿
                        </Button>
                      </Space>
                      <Table
                        columns={draftColumns}
                        dataSource={drafts}
                        rowKey="id"
                        loading={draftLoading}
                        pagination={{
                          pageSize: 10,
                          showSizeChanger: true,
                          showTotal: (total) => `共 ${total} 个草稿`,
                        }}
                        scroll={{ x: 1700 }}
                      />
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />

      <TaskForm
        visible={taskFormVisible}
        task={editingTask}
        onClose={handleTaskFormClose}
        onSuccess={handleTaskFormSuccess}
      />

      <Modal
        title="确认任务草稿"
        open={confirmModalVisible}
        onCancel={() => {
          setConfirmModalVisible(false);
          setConfirmingDraftId(null);
          setConfirmingDraft(null);
          confirmForm.resetFields();
        }}
        onOk={handleConfirmDraft}
        destroyOnClose
      >
        <Form form={confirmForm} layout="vertical" autoComplete="off">
          <Form.Item
            label="执行账号"
            name="accountIds"
            rules={[{ required: true, message: '请选择至少一个账号' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择账号"
              options={accounts.map((account) => ({
                label: `${account.phoneNumber}${account.status === 'online' ? '（在线）' : ''}`,
                value: account.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="模板"
            name="templateId"
            rules={[{ required: true, message: '请选择模板' }]}
          >
            <Select
              placeholder="选择模板"
              options={templates
                .filter((template) => template.enabled !== false)
                .filter((template) => {
                  if (!confirmingDraft) {
                    return true;
                  }
                  if (confirmingDraft.taskType === 'group_posting') {
                    return template.category === 'group_message';
                  }
                  return template.category === 'channel_comment';
                })
                .map((template) => ({
                  label: template.name || template.content?.slice(0, 30) || template.id,
                  value: template.id,
                }))}
            />
          </Form.Item>

          <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请填写优先级' }]}>
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="间隔(分钟)" name="interval" rules={[{ required: true, message: '请填写间隔' }]}>
            <InputNumber min={10} max={1440} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="随机延迟(分钟)" name="randomDelay">
            <InputNumber min={0} max={60} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="评论概率(%)" name="commentProbability">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="重试开关" name="retryOnError">
            <Select
              options={[
                { label: '开启', value: true },
                { label: '关闭', value: false },
              ]}
            />
          </Form.Item>

          <Form.Item label="最大重试次数" name="maxRetries">
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="自动加群" name="autoJoinEnabled">
            <Select
              options={[
                { label: '开启', value: true },
                { label: '关闭', value: false },
              ]}
            />
          </Form.Item>

          <Form.Item label="预检策略" name="precheckPolicy">
            <Select
              options={[
                { label: 'partial（部分可执行）', value: 'partial' },
                { label: 'strict（全量可执行）', value: 'strict' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <TaskHistoryModal
        taskId={historyTaskId}
        visible={historyModalVisible}
        onClose={handleHistoryModalClose}
      />
    </div>
  );
};

export default TaskList;
