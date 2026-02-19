import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useTaskStore } from '../../stores/task';
import { tasksApi } from '../../services/api/tasks';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WsMessageType } from '../../services/websocket/client';
import type { Task } from '../../types/task';
import { PageHeader } from '../../components/Layout';
import { showError } from '../../utils/notification';
import { RATE_LIMIT_COPY } from '../../constants/rateLimitCopy';

const LazyTaskForm = lazy(() =>
  import('../../components/Task/TaskForm').then((module) => ({ default: module.TaskForm }))
);
const LazyTaskHistoryModal = lazy(() =>
  import('../../components/Task/TaskHistoryModal').then((module) => ({
    default: module.TaskHistoryModal,
  }))
);
const RATE_LIMIT_TIP_CLOSED_KEY = 'task-rate-limit-tip-closed';

const TaskList: React.FC = () => {
  const { tasks, setTasks, updateTask, removeTask, setLoading, loading } = useTaskStore();

  const [refreshing, setRefreshing] = useState(false);
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null);
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);

  const [taskStatusFilter, setTaskStatusFilter] = useState<Task['status'] | undefined>(undefined);
  const [taskKeyword, setTaskKeyword] = useState('');
  const [showRateLimitTip, setShowRateLimitTip] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.localStorage.getItem(RATE_LIMIT_TIP_CLOSED_KEY) !== '1';
  });

  useWebSocket(
    WsMessageType.TASK_STATUS,
    (data: unknown) => {
      if (data && typeof data === 'object' && 'taskId' in data && typeof data.taskId === 'string') {
        const payload = data as {
          taskId: string;
          status?: Task['status'];
          nextExecutionAt?: string;
          lastExecutedAt?: string;
          successCount?: number;
          failureCount?: number;
        };

        updateTask(payload.taskId, {
          status: payload.status,
          nextExecutionAt: payload.nextExecutionAt ? new Date(payload.nextExecutionAt) : undefined,
          lastExecutedAt: payload.lastExecutedAt ? new Date(payload.lastExecutedAt) : undefined,
          successCount: payload.successCount,
          failureCount: payload.failureCount,
        });
      }
    },
    [updateTask]
  );

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
    message.success('刷新成功');
  };

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

  const handleDeleteWithConfirm = (task: Task) => {
    Modal.confirm({
      title: '确认删除任务',
      content: `任务「${task.name}」删除后将无法恢复，是否继续？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => handleDelete(task.id),
    });
  };

  const handleViewHistory = (taskId: string) => {
    setHistoryTaskId(taskId);
    setHistoryModalVisible(true);
  };

  const handleHistoryModalClose = () => {
    setHistoryModalVisible(false);
    setHistoryTaskId(null);
  };

  const handleEdit = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      setEditingTask(task);
      setTaskFormVisible(true);
    }
  };

  const handleCreate = () => {
    setEditingTask(null);
    setTaskFormVisible(true);
  };

  const handleTaskFormClose = () => {
    setTaskFormVisible(false);
    setEditingTask(null);
  };

  const handleTaskFormSuccess = () => {
    void loadTasks();
  };

  const handleCloseRateLimitTip = () => {
    setShowRateLimitTip(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RATE_LIMIT_TIP_CLOSED_KEY, '1');
    }
  };

  const renderTypeTag = (type: Task['type']) => {
    if (type === 'send_message') {
      return <Tag color="blue">消息发送</Tag>;
    }
    return <Tag color="purple">自动评论</Tag>;
  };

  const renderStatusTag = (status: Task['status']) => {
    if (status === 'running') {
      return <Tag color="success">运行中</Tag>;
    }
    return <Tag>已停止</Tag>;
  };

  const formatTime = (date?: Date) => {
    if (!date) {
      return '-';
    }
    return new Date(date).toLocaleString('zh-CN');
  };

  const calculateSuccessRate = (task: Task): string => {
    const total = task.successCount + task.failureCount;
    if (total === 0) {
      return '-';
    }
    const rate = (task.successCount / total) * 100;
    return `${rate.toFixed(1)}%`;
  };

  const handleTaskActionMenuClick = (record: Task, key: string) => {
    if (key === 'stop') {
      void handleStop(record.id);
      return;
    }
    if (key === 'history') {
      handleViewHistory(record.id);
      return;
    }
    if (key === 'edit') {
      handleEdit(record.id);
      return;
    }
    if (key === 'delete') {
      handleDeleteWithConfirm(record);
    }
  };

  const columns: ColumnsType<Task> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
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
      width: 90,
      sorter: (a, b) => a.priority - b.priority,
    },
    {
      title: '执行统计',
      key: 'stats',
      width: 170,
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
      render: (date, record) => (record.status === 'running' ? formatTime(date) : '-'),
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
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const isOperating = operatingTaskId === record.id;

        const menuItems: MenuProps['items'] = [
          {
            key: 'stop',
            label: '停止任务',
            icon: <StopOutlined />,
            disabled: record.status !== 'running' || isOperating,
          },
          {
            key: 'history',
            label: '查看历史',
            icon: <HistoryOutlined />,
          },
          {
            key: 'edit',
            label: '编辑任务',
            icon: <EditOutlined />,
            disabled: record.status === 'running' || isOperating,
          },
          {
            key: 'delete',
            label: '删除任务',
            icon: <DeleteOutlined />,
            disabled: record.status === 'running' || isOperating,
            danger: true,
          },
        ];

        return (
          <Space size="small" className="task-row-actions">
            {record.status === 'stopped' ? (
              <Tooltip title="启动任务">
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => void handleStart(record.id)}
                  loading={isOperating}
                >
                  启动
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="暂停任务">
                <Button
                  size="small"
                  icon={<PauseCircleOutlined />}
                  onClick={() => void handlePause(record.id)}
                  loading={isOperating}
                >
                  暂停
                </Button>
              </Tooltip>
            )}

            <Dropdown
              menu={{
                items: menuItems,
                onClick: ({ key }) => handleTaskActionMenuClick(record, key),
              }}
              trigger={['click']}
            >
              <Button size="small" icon={<EllipsisOutlined />}>
                更多
              </Button>
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTasks = useMemo(() => {
    const keyword = taskKeyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskStatusFilter && task.status !== taskStatusFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return `${task.name} ${task.id} ${task.templateId} ${task.targetId}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [taskKeyword, taskStatusFilter, tasks]);

  const runningTaskCount = useMemo(
    () => filteredTasks.filter((task) => task.status === 'running').length,
    [filteredTasks]
  );
  const stoppedTaskCount = useMemo(
    () => filteredTasks.filter((task) => task.status === 'stopped').length,
    [filteredTasks]
  );

  return (
    <div className="task-page">
      <PageHeader
        title="任务管理"
        subTitle="管理自动化任务"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void handleRefresh()}
              loading={refreshing}
            >
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建任务
            </Button>
          </Space>
        }
      />

      {showRateLimitTip && (
        <Alert
          type="warning"
          showIcon
          closable
          message={RATE_LIMIT_COPY.taskListHint}
          style={{ marginBottom: 16 }}
          onClose={handleCloseRateLimitTip}
        />
      )}

      <div className="task-page__metrics">
        <Card size="small">
          <Statistic title="筛选后任务" value={filteredTasks.length} />
        </Card>
        <Card size="small">
          <Statistic title="运行中" value={runningTaskCount} valueStyle={{ color: '#1f8b4d' }} />
        </Card>
        <Card size="small">
          <Statistic title="已停止" value={stoppedTaskCount} valueStyle={{ color: '#637381' }} />
        </Card>
        <Card size="small">
          <Statistic
            title="任务成功总数"
            value={filteredTasks.reduce((sum, task) => sum + task.successCount, 0)}
            valueStyle={{ color: '#0d7a6f' }}
          />
        </Card>
      </div>

      <Card size="small" className="task-page__filters">
        <Space wrap size={12}>
          <Input
            allowClear
            placeholder="搜索任务名/任务ID/目标ID"
            prefix={<SearchOutlined />}
            value={taskKeyword}
            onChange={(e) => setTaskKeyword(e.target.value)}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="任务状态"
            style={{ width: 150 }}
            value={taskStatusFilter}
            onChange={(value) => setTaskStatusFilter(value)}
            options={[
              { label: '运行中', value: 'running' },
              { label: '已停止', value: 'stopped' },
            ]}
          />
        </Space>
      </Card>

      <Table
        className="task-page__table"
        columns={columns}
        dataSource={filteredTasks}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: '暂无任务，可先创建任务' }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个任务`,
        }}
        scroll={{ x: 1500 }}
      />

      <Suspense fallback={null}>
        <LazyTaskForm
          visible={taskFormVisible}
          task={editingTask}
          onClose={handleTaskFormClose}
          onSuccess={handleTaskFormSuccess}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyTaskHistoryModal
          taskId={historyTaskId}
          visible={historyModalVisible}
          onClose={handleHistoryModalClose}
        />
      </Suspense>
    </div>
  );
};

export default TaskList;
