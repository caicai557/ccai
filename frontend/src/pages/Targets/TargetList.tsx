import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Table, Tag, Button, Space, message, Popconfirm, Input } from 'antd';
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
import { showError } from '../../utils/notification';

const LazyAddTargetModal = lazy(() => import('../../components/Target/AddTargetModal'));

const TargetList: React.FC = () => {
  const { targets, setTargets, removeTarget, setLoading, loading } = useTargetStore();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [targetKeyword, setTargetKeyword] = useState('');

  const loadTargets = async () => {
    try {
      setLoading(true);
      const data = await targetsApi.getAll();
      setTargets(data);
    } catch (error) {
      showError('加载目标列表失败');
      console.error('Failed to load targets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTargets();
    setRefreshing(false);
    message.success('刷新成功');
  };

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

  const targetColumns: ColumnsType<Target> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: Target['type']) =>
        type === 'group' ? (
          <Tag color="blue" icon={<TeamOutlined />}>
            群组
          </Tag>
        ) : (
          <Tag color="purple" icon={<SoundOutlined />}>
            频道
          </Tag>
        ),
    },
    { title: '名称', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: 'Telegram ID',
      dataIndex: 'telegramId',
      key: 'telegramId',
      width: 180,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) =>
        enabled ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            已启用
          </Tag>
        ) : (
          <Tag color="default" icon={<CloseCircleOutlined />}>
            已禁用
          </Tag>
        ),
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
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
      ),
    },
  ];

  useEffect(() => {
    void loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTargets = useMemo(() => {
    const keyword = targetKeyword.trim().toLowerCase();
    if (!keyword) {
      return targets;
    }
    return targets.filter((item) =>
      `${item.title} ${item.telegramId}`.toLowerCase().includes(keyword)
    );
  }, [targetKeyword, targets]);

  return (
    <div>
      <PageHeader
        title="目标管理"
        subTitle="管理群组和频道（手动添加）"
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
        columns={targetColumns}
        title={() => (
          <Input
            allowClear
            placeholder="搜索目标名称/Telegram ID"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            style={{ width: 280 }}
          />
        )}
        dataSource={filteredTargets}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: '暂无目标，请点击右上角手动添加' }}
        pagination={{ pageSize: 10 }}
      />

      <Suspense fallback={null}>
        <LazyAddTargetModal
          visible={addModalVisible}
          onClose={() => setAddModalVisible(false)}
          onSuccess={loadTargets}
        />
      </Suspense>
    </div>
  );
};

export default TargetList;
