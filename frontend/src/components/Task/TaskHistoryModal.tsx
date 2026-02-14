import { useEffect, useState } from 'react';
import { Modal, Table, Tag, Empty, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { tasksApi, TaskExecution } from '../../services/api/tasks';

interface TaskHistoryModalProps {
  taskId: string | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * 任务执行历史对话框
 */
export const TaskHistoryModal: React.FC<TaskHistoryModalProps> = ({ taskId, visible, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<TaskExecution[]>([]);

  // 加载执行历史
  const loadHistory = async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      const data = await tasksApi.getHistory(taskId, 100);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load task history:', error);
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开时加载数据
  useEffect(() => {
    if (visible && taskId) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [visible, taskId]);

  // 格式化时间
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // 表格列定义
  const columns: ColumnsType<TaskExecution> = [
    {
      title: '执行时间',
      dataIndex: 'executedAt',
      key: 'executedAt',
      width: 180,
      render: (date) => formatTime(date),
    },
    {
      title: '结果',
      dataIndex: 'success',
      key: 'success',
      width: 100,
      render: (success: boolean) =>
        success ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            成功
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            失败
          </Tag>
        ),
    },
    {
      title: '消息内容',
      dataIndex: 'messageContent',
      key: 'messageContent',
      ellipsis: true,
      render: (content) => content || '-',
    },
    {
      title: '目标消息ID',
      dataIndex: 'targetMessageId',
      key: 'targetMessageId',
      width: 150,
      render: (id) => id || '-',
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (error) => (error ? <span style={{ color: '#ff4d4f' }}>{error}</span> : '-'),
    },
  ];

  return (
    <Modal
      title="执行历史"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {history.length === 0 && !loading ? (
          <Empty description="暂无执行历史" />
        ) : (
          <Table
            columns={columns}
            dataSource={history}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条记录`,
            }}
            scroll={{ x: 900 }}
          />
        )}
      </Spin>
    </Modal>
  );
};
