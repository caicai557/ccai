import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message, Popconfirm, Tooltip } from 'antd';
import {
  PlusOutlined,
  ExportOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAccountStore } from '../../stores/account';
import { accountsApi } from '../../services/api/accounts';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WsMessageType } from '../../services/websocket/client';
import type { Account } from '../../types/account';
import { PageHeader } from '../../components/Layout';
import { AddAccountModal, AccountDetailModal } from '../../components/Account';

/**
 * 账号列表页面
 */
const AccountList: React.FC = () => {
  const { accounts, setAccounts, updateAccount, removeAccount, setLoading, loading } =
    useAccountStore();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // WebSocket 实时更新账号状态
  useWebSocket(
    WsMessageType.ACCOUNT_STATUS,
    (data: any) => {
      if (data.accountId) {
        updateAccount(data.accountId, {
          status: data.status,
          lastActive: data.lastActiveAt ? new Date(data.lastActiveAt) : new Date(),
        });
      }
    },
    [updateAccount]
  );

  // 加载账号列表
  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await accountsApi.getAll();
      setAccounts(data);
    } catch (error) {
      message.error('加载账号列表失败');
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新账号列表
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
    message.success('刷新成功');
  };

  // 查看详情
  const handleViewDetail = (accountId: string) => {
    setSelectedAccountId(accountId);
    setDetailModalVisible(true);
  };

  // 导出会话文件
  const handleExport = async (accountId: string) => {
    try {
      await accountsApi.exportSession(accountId);
      message.success('会话文件导出成功');
    } catch (error) {
      message.error('导出会话文件失败');
      console.error('Failed to export session:', error);
    }
  };

  // 删除账号
  const handleDelete = async (accountId: string) => {
    try {
      await accountsApi.delete(accountId);
      removeAccount(accountId);
      message.success('账号删除成功');
    } catch (error) {
      message.error('删除账号失败');
      console.error('Failed to delete account:', error);
    }
  };

  // 格式化显示名称
  const getDisplayName = (account: Account): string => {
    if (account.firstName || account.lastName) {
      return `${account.firstName || ''} ${account.lastName || ''}`.trim();
    }
    return account.username || account.phoneNumber;
  };

  // 状态标签渲染
  const renderStatusTag = (status: Account['status']) => {
    const statusConfig = {
      online: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: '在线',
      },
      offline: {
        color: 'default',
        icon: <CloseCircleOutlined />,
        text: '离线',
      },
      restricted: {
        color: 'error',
        icon: <WarningOutlined />,
        text: '受限',
      },
    };

    const config = statusConfig[status];
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // 表格列定义
  const columns: ColumnsType<Account> = [
    {
      title: '手机号',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      width: 150,
    },
    {
      title: '显示名称',
      key: 'displayName',
      render: (_, record) => getDisplayName(record),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username) => username || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => renderStatusTag(status),
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActive',
      key: 'lastActive',
      width: 180,
      render: (date) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            >
              详情
            </Button>
          </Tooltip>
          <Tooltip title="导出会话文件">
            <Button
              type="link"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => handleExport(record.id)}
            >
              导出
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="删除账号将停止所有相关任务，确定要删除吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 初始化加载
  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div>
      <PageHeader
        title="账号管理"
        subTitle="管理Telegram账号"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
              添加账号
            </Button>
          </Space>
        }
      />

      <Table
        columns={columns}
        dataSource={accounts}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个账号`,
        }}
        scroll={{ x: 1200 }}
      />

      <AddAccountModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSuccess={loadAccounts}
      />

      <AccountDetailModal
        accountId={selectedAccountId}
        visible={detailModalVisible}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedAccountId(null);
        }}
        onExport={handleExport}
      />
    </div>
  );
};

export default AccountList;
