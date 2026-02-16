import React, { useEffect, useState } from 'react';
import {
  Card,
  Col,
  Row,
  Statistic,
  Progress,
  Table,
  Tag,
  Space,
  Button,
  Spin,
  Empty,
  Typography,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader } from '../../components/Layout';
import { statsApi, AccountStats, TaskStats } from '../../services/api/stats';
import type { DashboardStats } from '../../types/common';

const { Title, Text } = Typography;

/**
 * 统计仪表板页面
 */
const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [accountStats, setAccountStats] = useState<AccountStats[]>([]);
  const [taskStats, setTaskStats] = useState<TaskStats[]>([]);

  // 加载统计数据
  const loadStats = async () => {
    try {
      setLoading(true);
      const [dashboard, accounts, tasks] = await Promise.all([
        statsApi.getDashboard(),
        statsApi.getAccounts(),
        statsApi.getTasks(),
      ]);
      setDashboardStats(dashboard);
      setAccountStats(accounts);
      setTaskStats(tasks);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadStats();
    // 每30秒自动刷新
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // 账号统计表格列
  const accountColumns: ColumnsType<AccountStats> = [
    {
      title: '手机号',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      width: 150,
    },
    {
      title: '总消息数',
      dataIndex: 'totalMessages',
      key: 'totalMessages',
      width: 100,
      sorter: (a, b) => a.totalMessages - b.totalMessages,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 120,
      render: (rate: number) => (
        <Space>
          <Progress
            type="circle"
            percent={Math.round(rate * 100)}
            width={40}
            strokeColor={rate >= 0.9 ? '#52c41a' : rate >= 0.7 ? '#faad14' : '#ff4d4f'}
          />
          <Text>{(rate * 100).toFixed(1)}%</Text>
        </Space>
      ),
      sorter: (a, b) => a.successRate - b.successRate,
    },
    {
      title: '健康度',
      dataIndex: 'healthScore',
      key: 'healthScore',
      width: 120,
      render: (score: number) => (
        <Space>
          <Progress
            percent={score}
            size="small"
            strokeColor={score >= 80 ? '#52c41a' : score >= 60 ? '#faad14' : '#ff4d4f'}
            showInfo={false}
          />
          <Text>{score}</Text>
        </Space>
      ),
      sorter: (a, b) => a.healthScore - b.healthScore,
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActiveAt',
      key: 'lastActiveAt',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
    },
  ];

  // 任务统计表格列
  const taskColumns: ColumnsType<TaskStats> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'send_message' ? 'blue' : 'green'}>
          {type === 'send_message' ? '发送消息' : '自动评论'}
        </Tag>
      ),
    },
    {
      title: '执行次数',
      dataIndex: 'totalExecutions',
      key: 'totalExecutions',
      width: 100,
      sorter: (a, b) => a.totalExecutions - b.totalExecutions,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 100,
      render: (rate: number) => {
        const percent = Math.round(rate * 100);
        return (
          <Text type={percent >= 90 ? 'success' : percent >= 70 ? 'warning' : 'danger'}>
            {percent}%
          </Text>
        );
      },
      sorter: (a, b) => a.successRate - b.successRate,
    },
    {
      title: '最后执行',
      dataIndex: 'lastExecutedAt',
      key: 'lastExecutedAt',
      width: 180,
      render: (time?: string) => (time ? new Date(time).toLocaleString('zh-CN') : '-'),
    },
  ];

  // 计算在线率
  const getOnlineRate = () => {
    if (!dashboardStats || dashboardStats.totalAccounts === 0) return 0;
    return (dashboardStats.onlineAccounts / dashboardStats.totalAccounts) * 100;
  };

  // 计算任务活跃率
  const getTaskActiveRate = () => {
    if (!dashboardStats || dashboardStats.totalTasks === 0) return 0;
    return (dashboardStats.runningTasks / dashboardStats.totalTasks) * 100;
  };

  if (loading && !dashboardStats) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载统计数据中..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="仪表板"
        subTitle="系统运行状态概览"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadStats} loading={loading}>
            刷新
          </Button>
        }
      />

      {/* 核心指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic
              title="账号总数"
              value={dashboardStats?.totalAccounts || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
              suffix={
                <Text type="secondary" style={{ fontSize: 14 }}>
                  / {dashboardStats?.onlineAccounts || 0} 在线
                </Text>
              }
            />
            <Progress
              percent={getOnlineRate()}
              size="small"
              showInfo={false}
              strokeColor="#52c41a"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic
              title="群组/频道"
              value={dashboardStats?.totalTargets || 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
              suffix={
                <Text type="secondary" style={{ fontSize: 14 }}>
                  / {dashboardStats?.activeTargets || 0} 活跃
                </Text>
              }
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic
              title="运行中任务"
              value={dashboardStats?.runningTasks || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <Progress
              percent={getTaskActiveRate()}
              size="small"
              showInfo={false}
              strokeColor="#722ed1"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic
              title="今日发送"
              value={dashboardStats?.todayMessages || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
            <Space style={{ marginTop: 8 }}>
              <Text type="secondary">成功率:</Text>
              <Text
                strong
                type={
                  (dashboardStats?.todaySuccessRate || 0) >= 0.9
                    ? 'success'
                    : (dashboardStats?.todaySuccessRate || 0) >= 0.7
                      ? 'warning'
                      : 'danger'
                }
              >
                {((dashboardStats?.todaySuccessRate || 0) * 100).toFixed(1)}%
              </Text>
              {(dashboardStats?.todaySuccessRate || 0) >= 0.9 ? (
                <RiseOutlined style={{ color: '#52c41a' }} />
              ) : (
                <FallOutlined style={{ color: '#ff4d4f' }} />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 账号统计 */}
      <Card
        title={
          <Space>
            <UserOutlined />
            <Title level={5} style={{ margin: 0 }}>
              账号统计
            </Title>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        {accountStats.length > 0 ? (
          <Table
            columns={accountColumns}
            dataSource={accountStats}
            rowKey="accountId"
            pagination={{
              pageSize: 5,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 个账号`,
            }}
            size="small"
          />
        ) : (
          <Empty description="暂无账号数据" />
        )}
      </Card>

      {/* 任务统计 */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <Title level={5} style={{ margin: 0 }}>
              任务统计
            </Title>
          </Space>
        }
      >
        {taskStats.length > 0 ? (
          <Table
            columns={taskColumns}
            dataSource={taskStats}
            rowKey="taskId"
            pagination={{
              pageSize: 5,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 个任务`,
            }}
            size="small"
          />
        ) : (
          <Empty description="暂无任务数据" />
        )}
      </Card>

      {/* 系统健康提示 */}
      {dashboardStats && (dashboardStats.todaySuccessRate || 0) < 0.7 && (
        <Card style={{ marginTop: 24, borderColor: '#faad14' }} bodyStyle={{ padding: 16 }}>
          <Space>
            <WarningOutlined style={{ color: '#faad14', fontSize: 20 }} />
            <div>
              <Text strong>系统健康提示</Text>
              <br />
              <Text type="secondary">
                今日消息成功率较低（
                {((dashboardStats.todaySuccessRate || 0) * 100).toFixed(1)}%
                ），建议检查账号状态和网络连接。
              </Text>
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
