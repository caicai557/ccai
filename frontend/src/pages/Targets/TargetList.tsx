import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  message,
  Popconfirm,
  Card,
  Input,
  Select,
  InputNumber,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  SoundOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTargetStore } from '../../stores/target';
import { targetsApi } from '../../services/api/targets';
import { discoveryApi } from '../../services/api/discovery';
import type { Target } from '../../types/target';
import type { DiscoveryCandidate } from '../../types/discovery';
import PageHeader from '../../components/Layout/PageHeader';
import { AddTargetModal } from '../../components/Target';
import { showError } from '../../utils/notification';

const TargetList: React.FC = () => {
  const { targets, setTargets, removeTarget, setLoading, loading } = useTargetStore();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [accountId, setAccountId] = useState('');
  const [keywordsText, setKeywordsText] = useState('manila 华人,makati 华社,bgc 中文,quezon 华人');
  const [threshold, setThreshold] = useState(0.6);
  const [dryRun, setDryRun] = useState(true);
  const [candidateStatus, setCandidateStatus] = useState<string | undefined>(undefined);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);

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

  const loadCandidates = async () => {
    try {
      setCandidateLoading(true);
      const data = await discoveryApi.list({ page: 1, pageSize: 100, status: candidateStatus });
      setCandidates(data.items);
    } catch (error) {
      showError('加载候选失败');
      console.error(error);
    } finally {
      setCandidateLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTargets(), loadCandidates()]);
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

  const runDiscovery = async () => {
    if (!accountId.trim()) {
      message.error('请先填写 accountId');
      return;
    }

    try {
      setCandidateLoading(true);
      const keywords = keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const result = await discoveryApi.run({
        accountId: accountId.trim(),
        keywords,
        threshold,
        dryRun,
        sourceTypes: ['telegram_dialog_search'],
      });
      message.success(
        `发现完成：扫描${result.scanned}，通过${result.accepted}，拒绝${result.rejected}`
      );
      if (!dryRun) {
        await loadCandidates();
      } else {
        setCandidates(result.items);
      }
    } catch (error) {
      showError((error as Error).message || '发现失败');
    } finally {
      setCandidateLoading(false);
    }
  };

  const acceptCandidates = async () => {
    if (selectedCandidateIds.length === 0) {
      message.warning('请先勾选候选');
      return;
    }

    try {
      const result = await discoveryApi.accept(selectedCandidateIds);
      message.success(
        `入库完成：新增${result.summary.created}，重复${result.summary.duplicated}，失败${result.summary.failed}`
      );
      setSelectedCandidateIds([]);
      await Promise.all([loadCandidates(), loadTargets()]);
    } catch (error) {
      showError((error as Error).message || '加入目标失败');
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

  const candidateColumns: ColumnsType<DiscoveryCandidate> = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '规则分', dataIndex: 'rulesScore', key: 'rulesScore', width: 90 },
    {
      title: 'AI分',
      dataIndex: 'aiScore',
      key: 'aiScore',
      width: 90,
      render: (v?: number) => (v ?? '-').toString(),
    },
    { title: '总分', dataIndex: 'finalScore', key: 'finalScore', width: 90 },
    { title: '可达性', dataIndex: 'reachabilityStatus', key: 'reachabilityStatus', width: 90 },
    { title: '拒绝原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) =>
        status === 'pending' ? (
          <Tag color="processing">待处理</Tag>
        ) : status === 'accepted' ? (
          <Tag color="success">已入库</Tag>
        ) : (
          <Tag color="error">已拒绝</Tag>
        ),
    },
  ];

  useEffect(() => {
    loadTargets();
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateStatus]);

  return (
    <div>
      <PageHeader
        title="目标管理"
        subTitle="管理群组和频道 + 智能发现（马尼拉）"
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

      <Card title="智能发现（马尼拉）" extra={<ThunderboltOutlined />} style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="账号ID（必填）"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={{ width: 220 }}
          />
          <Input
            placeholder="关键词，逗号分隔"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            style={{ width: 380 }}
          />
          <InputNumber
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(v) => setThreshold(v ?? 0.6)}
            addonBefore="阈值"
          />
          <span>
            DryRun <Switch checked={dryRun} onChange={setDryRun} />
          </span>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={candidateLoading}
            onClick={runDiscovery}
          >
            运行发现
          </Button>
          <Button onClick={acceptCandidates}>加入目标列表</Button>
          <Select
            allowClear
            placeholder="状态过滤"
            style={{ width: 140 }}
            value={candidateStatus}
            onChange={(v) => setCandidateStatus(v)}
            options={[
              { label: '待处理', value: 'pending' },
              { label: '已入库', value: 'accepted' },
              { label: '已拒绝', value: 'rejected' },
            ]}
          />
        </Space>

        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          columns={candidateColumns}
          dataSource={candidates}
          loading={candidateLoading}
          rowSelection={{
            selectedRowKeys: selectedCandidateIds,
            onChange: (keys) => setSelectedCandidateIds(keys as string[]),
            getCheckboxProps: (record) => ({ disabled: record.status !== 'pending' }),
          }}
          pagination={{ pageSize: 8 }}
        />
      </Card>

      <Table
        columns={targetColumns}
        dataSource={targets}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
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
