import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message, Popconfirm } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTargetStore } from '../../stores/target';
import { targetsApi } from '../../services/api/targets';
import type { Target } from '../../types/target';
import PageHeader from '../../components/Layout/PageHeader';
import { AddTargetModal } from '../../components/Target';

/**
 * 目标列表页面
 */
const TargetList: React.FC = () => {
  const { targets, setTargets, removeTarget, setLoading, loading } = useTargetStore();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 加载目标列表
  const loadTargets = async () => {
    try {
      setLoading(true);
      const data = await targetsApi.getAll();
      setTargets(data);
    } catch (error) {
      message.error('加载目标列表失败');
      console.error('Failed to load targets:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新目标列表
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTargets();
    setRefreshing(false);
    message.success('刷新成功');
  };

  // 删除目标
  const handleDelete = async (targetId: string) => {
    try {
      await targetsApi.delete(targetId);
      removeTarget(targetId);
      message.success('目标删除成功');
    } catch (error) {
      message.error('删除目标失败');
      console.error('Failed to delete target:', error);
    }
  };

  // 类型标签渲染
  const renderTypeTag = (type: Target['type']) => {
    const typeConfig = {
      group: {
        color: 'blue',
        icon: <TeamOutlined />,
        text: '群组',
      },
      channel: {
        color: 'purple',
        icon: <SoundOutlined />,
        text: '频道',
      },
    };

    const config = typeConfig[type];
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // 启用状态标签渲染
  const renderEnabledTag = (enabled: boolean) => {
    return enabled ? (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        已启用
      </Tag>
    ) : (
      <Tag color="default" icon={<CloseCircleOutlined />}>
        已禁用
      </Tag>
    );
  };

  // 表格列定义
  const columns: ColumnsType<Target> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => renderTypeTag(type),
      filters: [
        { text: '群组', value: 'group' },
        { text: '频道', value: 'channel' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: '名称',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Telegram ID',
      dataIndex: 'telegramId',
      key: 'telegramId',
      width: 150,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled) => renderEnabledTag(enabled),
      filters: [
        { text: '已启用', value: true },
        { text: '已禁用', value: false },
      ],
      onFilter: (value, record) => record.enabled === value,
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date) => new Date(date).toLocaleString('zh-CN'),
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Popconfirm
            title="确认删除"
            description="删除目标将影响相关任务，确定要删除吗？"
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
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="目标管理"
        subTitle="管理群组和频道"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
              添加目标
            </Button>
          </Space>
        }
      />

      <Table
        columns={columns}
        dataSource={targets}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个目标`,
        }}
        scroll={{ x: 1000 }}
      />

      <AddTargetModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSuccess={loadTargets}
      />
    </div>
  );
};

export default TargetList;
