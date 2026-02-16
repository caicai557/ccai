import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message, Popconfirm, Tooltip, Badge } from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ReloadOutlined,
  HistoryOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTaskStore } from '../../stores/task';
import { tasksApi } from '../../services/api/tasks';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WsMessageType } from '../../services/websocket/client';
import type { Task } from '../../types/task';
import { PageHeader } from '../../components/Layout';
import { TaskForm, TaskHistoryModal } from '../../components/Task';
import { showError } from '../../utils/notification';

/**
 * 任务列表页面
 */
const TaskList: React.FC = () => {
  const { tasks, setTasks, updateTask, removeTask, setLoading, loading } = useTaskStore();
  const [refreshing, setRefreshing] = useState(false);
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null);
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);

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

  // 刷新任务列表
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
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

  // 初始化加载
  useEffect(() => {
    loadTasks();
  }, []);

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

      <TaskForm
        visible={taskFormVisible}
        task={editingTask}
        onClose={handleTaskFormClose}
        onSuccess={handleTaskFormSuccess}
      />

      <TaskHistoryModal
        taskId={historyTaskId}
        visible={historyModalVisible}
        onClose={handleHistoryModalClose}
      />
    </div>
  );
};

export default TaskList;
