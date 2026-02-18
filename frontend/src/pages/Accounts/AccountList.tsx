import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  message,
  Popconfirm,
  Tooltip,
  Select,
  Input,
  Card,
  Statistic,
  Modal,
  Form,
  InputNumber,
  Upload,
  Drawer,
  Descriptions,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  ExportOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  EyeOutlined,
  SearchOutlined,
  EditOutlined,
  OrderedListOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { useAccountStore } from '../../stores/account';
import { accountsApi } from '../../services/api/accounts';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WsMessageType } from '../../services/websocket/client';
import type {
  Account,
  AccountPoolStatus,
  AccountProfileBatchJob,
  AccountProfileBatchJobItem,
  AccountProfileBatchJobStatus,
} from '../../types/account';
import { PageHeader } from '../../components/Layout';
import { showError } from '../../utils/notification';

const LazyAddAccountModal = lazy(() => import('../../components/Account/AddAccountModal'));
const LazyAccountDetailModal = lazy(() => import('../../components/Account/AccountDetailModal'));

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
  const [poolStatusFilter, setPoolStatusFilter] = useState<AccountPoolStatus | undefined>(
    undefined
  );
  const [statusFilter, setStatusFilter] = useState<Account['status'] | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [updatingPoolStatusId, setUpdatingPoolStatusId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [avatarFileList, setAvatarFileList] = useState<UploadFile[]>([]);
  const [jobDrawerVisible, setJobDrawerVisible] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobs, setJobs] = useState<AccountProfileBatchJob[]>([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(10);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [jobDetail, setJobDetail] = useState<{
    job: AccountProfileBatchJob;
    items: AccountProfileBatchJobItem[];
  } | null>(null);
  const [profileBatchForm] = Form.useForm<{
    firstNameTemplate?: string;
    lastNameTemplate?: string;
    bioTemplate?: string;
    throttlePreset: 'conservative' | 'balanced' | 'fast';
    retryLimit: number;
  }>();
  const initializedRef = useRef(false);

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
      const data = await accountsApi.getAll({
        poolStatus: poolStatusFilter,
      });
      setAccounts(data);
    } catch (error) {
      showError('加载账号列表失败');
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手动更新账号池状态
  const handleUpdatePoolStatus = async (accountId: string, poolStatus: AccountPoolStatus) => {
    try {
      setUpdatingPoolStatusId(accountId);
      const account = await accountsApi.updatePoolStatus(accountId, poolStatus);
      updateAccount(accountId, account);
      message.success('账号池状态已更新');
    } catch (error) {
      showError('更新账号池状态失败');
      console.error('Failed to update pool status:', error);
    } finally {
      setUpdatingPoolStatusId(null);
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
      showError('导出会话文件失败');
      console.error('Failed to export session:', error);
    }
  };

  // 删除账号
  const handleDelete = async (accountId: string) => {
    try {
      await accountsApi.delete(accountId);
      removeAccount(accountId);
      setSelectedAccountIds((prev) => prev.filter((id) => id !== accountId));
      message.success('账号删除成功');
    } catch (error) {
      showError('删除账号失败');
      console.error('Failed to delete account:', error);
    }
  };

  const loadProfileBatchJobs = async (page: number = jobPage, pageSize: number = jobPageSize) => {
    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const normalizedPageSize =
      Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : jobPageSize || 20;

    try {
      setJobsLoading(true);
      const result = await accountsApi.listProfileBatchJobs({
        page: normalizedPage,
        pageSize: normalizedPageSize,
      });
      setJobs(result.items);
      setJobTotal(result.total);
      setJobPage(result.page);
      setJobPageSize(result.pageSize);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载资料批次失败';
      showError(message || '加载资料批次失败');
      console.error('Failed to load profile batch jobs:', error);
    } finally {
      setJobsLoading(false);
    }
  };

  const loadProfileBatchJobDetail = async (jobId: string) => {
    try {
      setJobDetailLoading(true);
      const detail = await accountsApi.getProfileBatchJobDetail(jobId);
      setJobDetail(detail);
      setSelectedJobId(jobId);
    } catch (error) {
      showError('加载批次详情失败');
      console.error('Failed to load profile batch job detail:', error);
    } finally {
      setJobDetailLoading(false);
    }
  };

  const openBatchModal = () => {
    if (selectedAccountIds.length === 0) {
      message.warning('请先勾选账号');
      return;
    }
    profileBatchForm.setFieldsValue({
      throttlePreset: 'conservative',
      retryLimit: 1,
    });
    setBatchModalVisible(true);
  };

  const handleCreateProfileBatchJob = async () => {
    const formValues = await profileBatchForm.validateFields();
    const hasTemplateInput = Boolean(
      formValues.firstNameTemplate?.trim() ||
        formValues.lastNameTemplate?.trim() ||
        formValues.bioTemplate?.trim()
    );
    const avatarFiles = avatarFileList
      .map((item) => item.originFileObj)
      .filter((file): file is NonNullable<typeof file> => Boolean(file));

    if (!hasTemplateInput && avatarFiles.length === 0) {
      message.warning('至少填写一个资料字段或上传头像素材');
      return;
    }

    try {
      setBatchSubmitting(true);
      const job = await accountsApi.createProfileBatchJob({
        accountIds: selectedAccountIds,
        firstNameTemplate: formValues.firstNameTemplate?.trim() || undefined,
        lastNameTemplate: formValues.lastNameTemplate?.trim() || undefined,
        bioTemplate: formValues.bioTemplate?.trim() || undefined,
        throttlePreset: formValues.throttlePreset,
        retryLimit: formValues.retryLimit,
        avatarFiles,
      });
      message.success('资料批次已创建');
      setBatchModalVisible(false);
      setAvatarFileList([]);
      profileBatchForm.resetFields();
      setJobDrawerVisible(true);
      await loadProfileBatchJobs(1, jobPageSize);
      await loadProfileBatchJobDetail(job.id);
    } catch (error) {
      showError('创建资料批次失败');
      console.error('Failed to create profile batch job:', error);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleCancelProfileBatchJob = async (jobId: string) => {
    try {
      await accountsApi.cancelProfileBatchJob(jobId);
      message.success('批次已取消');
      await loadProfileBatchJobs(jobPage, jobPageSize);
      if (selectedJobId === jobId) {
        await loadProfileBatchJobDetail(jobId);
      }
    } catch (error) {
      showError('取消批次失败');
      console.error('Failed to cancel profile batch job:', error);
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

  const renderPoolStatusTag = (poolStatus: AccountPoolStatus) => {
    const map: Record<AccountPoolStatus, { color: string; text: string }> = {
      ok: { color: 'success', text: '可用' },
      error: { color: 'warning', text: '异常' },
      banned: { color: 'error', text: '封禁' },
      cooldown: { color: 'processing', text: '冷却' },
    };
    const item = map[poolStatus];
    return <Tag color={item.color}>{item.text}</Tag>;
  };

  const renderProfileJobStatusTag = (status: AccountProfileBatchJobStatus) => {
    const map: Record<AccountProfileBatchJobStatus, { color: string; text: string }> = {
      pending: { color: 'default', text: '待执行' },
      running: { color: 'processing', text: '执行中' },
      completed: { color: 'success', text: '已完成' },
      cancelled: { color: 'warning', text: '已取消' },
      failed: { color: 'error', text: '失败' },
    };
    const item = map[status];
    return <Tag color={item.color}>{item.text}</Tag>;
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
      title: '账号池',
      dataIndex: 'poolStatus',
      key: 'poolStatus',
      width: 120,
      render: (poolStatus: AccountPoolStatus) => renderPoolStatusTag(poolStatus),
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
          <Select
            size="small"
            style={{ width: 100 }}
            value={record.poolStatus}
            loading={updatingPoolStatusId === record.id}
            onChange={(value) => handleUpdatePoolStatus(record.id, value)}
            options={[
              { label: '可用', value: 'ok' },
              { label: '异常', value: 'error' },
              { label: '封禁', value: 'banned' },
              { label: '冷却', value: 'cooldown' },
            ]}
          />
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

  const filteredAccounts = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase();
    return accounts.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (!keywordText) {
        return true;
      }

      const displayName = getDisplayName(item).toLowerCase();
      const searchText = `${item.phoneNumber} ${item.username || ''} ${displayName}`.toLowerCase();
      return searchText.includes(keywordText);
    });
  }, [accounts, keyword, statusFilter]);

  const onlineCount = useMemo(
    () => filteredAccounts.filter((item) => item.status === 'online').length,
    [filteredAccounts]
  );
  const restrictedCount = useMemo(
    () => filteredAccounts.filter((item) => item.status === 'restricted').length,
    [filteredAccounts]
  );
  const usablePoolCount = useMemo(
    () => filteredAccounts.filter((item) => item.poolStatus === 'ok').length,
    [filteredAccounts]
  );

  const jobSuccessRate = (job: AccountProfileBatchJob): number => {
    const { summary } = job;
    if (!summary.total) {
      return 0;
    }
    return Math.round(((summary.success + summary.skipped) / summary.total) * 100);
  };

  const rowSelection = {
    selectedRowKeys: selectedAccountIds,
    onChange: (keys: React.Key[]) => {
      setSelectedAccountIds(keys.map((item) => String(item)));
    },
    preserveSelectedRowKeys: true,
  };

  const jobColumns: ColumnsType<AccountProfileBatchJob> = [
    {
      title: '批次ID',
      dataIndex: 'id',
      key: 'id',
      width: 180,
      render: (value: string) => value.slice(0, 12),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: AccountProfileBatchJobStatus) => renderProfileJobStatusTag(status),
    },
    {
      title: '执行进度',
      key: 'progress',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Progress
            percent={jobSuccessRate(record)}
            size="small"
            status={record.status === 'failed' ? 'exception' : undefined}
            style={{ width: 180 }}
          />
          <span>
            总:{record.summary.total} 成功:{record.summary.success} 失败:{record.summary.failed}
          </span>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => loadProfileBatchJobDetail(record.id)}>
            详情
          </Button>
          <Popconfirm
            title="确认取消该批次？"
            onConfirm={() => handleCancelProfileBatchJob(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={
              record.status === 'completed' ||
              record.status === 'failed' ||
              record.status === 'cancelled'
            }
          >
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={
                record.status === 'completed' ||
                record.status === 'failed' ||
                record.status === 'cancelled'
              }
            >
              取消
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const jobItemColumns: ColumnsType<AccountProfileBatchJobItem> = [
    {
      title: '#',
      dataIndex: 'itemIndex',
      key: 'itemIndex',
      width: 60,
    },
    {
      title: '账号',
      key: 'account',
      render: (_, record) => record.accountPhoneNumber || record.accountId,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: AccountProfileBatchJobItem['status']) => {
        const colorMap: Record<AccountProfileBatchJobItem['status'], string> = {
          pending: 'default',
          running: 'processing',
          success: 'success',
          failed: 'error',
          cancelled: 'warning',
          skipped: 'default',
        };
        return <Tag color={colorMap[status]}>{status}</Tag>;
      },
    },
    {
      title: '尝试次数',
      key: 'attempt',
      width: 120,
      render: (_, record) => `${record.attempt}/${record.maxAttempts}`,
    },
    {
      title: '失败原因',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (value?: string) => value || '-',
    },
  ];

  // 初始化加载
  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    loadAccounts();
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolStatusFilter]);

  useEffect(() => {
    if (!jobDrawerVisible) {
      return;
    }
    void loadProfileBatchJobs();
    if (selectedJobId) {
      void loadProfileBatchJobDetail(selectedJobId);
    }
    const timer = window.setInterval(() => {
      void loadProfileBatchJobs();
      if (selectedJobId) {
        void loadProfileBatchJobDetail(selectedJobId);
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDrawerVisible, selectedJobId]);

  return (
    <div>
      <PageHeader
        title="账号管理"
        subTitle="管理Telegram账号"
        extra={
          <Space>
            <Input
              allowClear
              placeholder="搜索手机号/用户名/显示名"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder="在线状态"
              style={{ width: 140 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { label: '在线', value: 'online' },
                { label: '离线', value: 'offline' },
                { label: '受限', value: 'restricted' },
              ]}
            />
            <Select
              allowClear
              placeholder="账号池过滤"
              style={{ width: 160 }}
              value={poolStatusFilter}
              onChange={(value) => setPoolStatusFilter(value)}
              options={[
                { label: '可用', value: 'ok' },
                { label: '异常', value: 'error' },
                { label: '封禁', value: 'banned' },
                { label: '冷却', value: 'cooldown' },
              ]}
            />
            <Button icon={<OrderedListOutlined />} onClick={() => setJobDrawerVisible(true)}>
              资料批次
            </Button>
            <Button
              type="default"
              icon={<EditOutlined />}
              onClick={openBatchModal}
              disabled={selectedAccountIds.length === 0}
            >
              批量改资料({selectedAccountIds.length})
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
              添加账号
            </Button>
          </Space>
        }
      />

      <Space size={12} wrap style={{ marginBottom: 12 }}>
        <Card size="small">
          <Statistic title="筛选后总数" value={filteredAccounts.length} />
        </Card>
        <Card size="small">
          <Statistic title="在线账号" value={onlineCount} valueStyle={{ color: '#1f8b4d' }} />
        </Card>
        <Card size="small">
          <Statistic title="受限账号" value={restrictedCount} valueStyle={{ color: '#b42318' }} />
        </Card>
        <Card size="small">
          <Statistic title="账号池可用" value={usablePoolCount} valueStyle={{ color: '#0d7a6f' }} />
        </Card>
      </Space>

      <Table
        columns={columns}
        dataSource={filteredAccounts}
        rowKey="id"
        rowSelection={rowSelection}
        loading={loading}
        locale={{ emptyText: '暂无账号数据，可先添加账号' }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个账号`,
        }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="批量资料修改"
        open={batchModalVisible}
        onCancel={() => {
          setBatchModalVisible(false);
          setAvatarFileList([]);
          profileBatchForm.resetFields();
        }}
        onOk={() => void handleCreateProfileBatchJob()}
        confirmLoading={batchSubmitting}
        okText="创建批次"
        cancelText="取消"
        width={680}
      >
        <div style={{ marginBottom: 12 }}>
          已选择账号：<Tag color="processing">{selectedAccountIds.length}</Tag>
        </div>
        <Form
          form={profileBatchForm}
          layout="vertical"
          initialValues={{
            throttlePreset: 'conservative',
            retryLimit: 1,
          }}
        >
          <Form.Item name="firstNameTemplate" label="名字模板">
            <Input placeholder="例如：马尼拉{index}" />
          </Form.Item>
          <Form.Item name="lastNameTemplate" label="姓氏模板">
            <Input placeholder="例如：用户{phoneLast4}" />
          </Form.Item>
          <Form.Item name="bioTemplate" label="简介模板">
            <Input.TextArea rows={3} placeholder="例如：欢迎交流，编号 {index}" />
          </Form.Item>
          <Form.Item label="头像素材池">
            <Upload
              multiple
              maxCount={20}
              accept=".jpg,.jpeg,.png,.webp"
              beforeUpload={() => false}
              fileList={avatarFileList}
              onChange={({ fileList }) => setAvatarFileList(fileList)}
            >
              <Button icon={<UploadOutlined />}>上传头像素材</Button>
            </Upload>
          </Form.Item>
          <Space size={12} align="start">
            <Form.Item
              label="节流策略"
              name="throttlePreset"
              style={{ minWidth: 180 }}
              rules={[{ required: true, message: '请选择节流策略' }]}
            >
              <Select
                options={[
                  { label: '保守（20-40秒）', value: 'conservative' },
                  { label: '均衡（5-10秒）', value: 'balanced' },
                  { label: '快速（0.5-1秒）', value: 'fast' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="失败重试次数"
              name="retryLimit"
              rules={[{ required: true, message: '请输入重试次数' }]}
            >
              <InputNumber min={0} max={3} precision={0} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Drawer
        title="资料批次进度"
        open={jobDrawerVisible}
        onClose={() => {
          setJobDrawerVisible(false);
          setJobDetail(null);
          setSelectedJobId(null);
        }}
        width={980}
      >
        <Table
          rowKey="id"
          columns={jobColumns}
          dataSource={jobs}
          loading={jobsLoading}
          size="small"
          pagination={{
            current: jobPage,
            pageSize: jobPageSize,
            total: jobTotal,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              void loadProfileBatchJobs(page, pageSize ?? jobPageSize);
            },
          }}
        />

        {jobDetail ? (
          <Card title={`批次详情: ${jobDetail.job.id}`} style={{ marginTop: 16 }} loading={jobDetailLoading}>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="状态">
                {renderProfileJobStatusTag(jobDetail.job.status)}
              </Descriptions.Item>
              <Descriptions.Item label="总数">{jobDetail.job.summary.total}</Descriptions.Item>
              <Descriptions.Item label="成功">{jobDetail.job.summary.success}</Descriptions.Item>
              <Descriptions.Item label="失败">{jobDetail.job.summary.failed}</Descriptions.Item>
              <Descriptions.Item label="取消">{jobDetail.job.summary.cancelled}</Descriptions.Item>
              <Descriptions.Item label="跳过">{jobDetail.job.summary.skipped}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              columns={jobItemColumns}
              dataSource={jobDetail.items}
              size="small"
              pagination={{
                pageSize: 8,
                showSizeChanger: false,
              }}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : null}
      </Drawer>

      <Suspense fallback={null}>
        <LazyAddAccountModal
          visible={addModalVisible}
          onClose={() => setAddModalVisible(false)}
          onSuccess={loadAccounts}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyAccountDetailModal
          accountId={selectedAccountId}
          visible={detailModalVisible}
          onClose={() => {
            setDetailModalVisible(false);
            setSelectedAccountId(null);
          }}
          onExport={handleExport}
        />
      </Suspense>
    </div>
  );
};

export default AccountList;
