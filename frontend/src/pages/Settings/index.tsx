/**
 * 系统设置页面
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Input,
  Button,
  Space,
  Divider,
  Typography,
  Modal,
  Spin,
  Alert,
  Tabs,
} from 'antd';
import {
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  ApiOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useConfigStore } from '../../stores/config';
import type { SystemConfig } from '../../types/config';
import PageContainer from '../../components/Layout/PageContainer';
import PageHeader from '../../components/Layout/PageHeader';

const { Paragraph } = Typography;
const { TabPane } = Tabs;

/**
 * 系统设置页面组件
 */
const Settings: React.FC = () => {
  const { config, loading, fetchConfig, updateConfig, resetConfig } = useConfigStore();
  const [form] = Form.useForm();
  const [hasChanges, setHasChanges] = useState(false);
  const isInitialLoad = React.useRef(true);

  // 加载配置
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // 当配置加载完成后，设置表单初始值
  useEffect(() => {
    if (config && isInitialLoad.current) {
      form.setFieldsValue(config);
      isInitialLoad.current = false;
    }
  }, [config, form]);

  // 处理表单值变化
  const handleValuesChange = () => {
    setHasChanges(true);
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await updateConfig(values);
      isInitialLoad.current = true; // 重置标志
      setHasChanges(false);
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  // 重置所有配置
  const handleResetAll = () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要将所有配置重置为默认值吗？此操作不可撤销。',
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await resetConfig();
        isInitialLoad.current = true; // 重置标志
        setHasChanges(false);
      },
    });
  };

  // 重置单个配置项
  const handleResetSection = (key: keyof SystemConfig) => {
    Modal.confirm({
      title: '确认重置',
      content: `确定要将 ${getSectionName(key)} 配置重置为默认值吗？`,
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await resetConfig(key);
        isInitialLoad.current = true; // 重置标志
        setHasChanges(false);
      },
    });
  };

  // 获取配置项名称
  const getSectionName = (key: keyof SystemConfig): string => {
    const names: Record<keyof SystemConfig, string> = {
      rateLimit: '速率限制',
      database: '数据库',
      log: '日志',
      websocket: 'WebSocket',
      api: 'API服务器',
    };
    return names[key];
  };

  if (loading && !config) {
    return (
      <PageContainer>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" tip="加载配置中..." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="系统设置"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleResetAll} danger>
              重置所有配置
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              disabled={!hasChanges}
              loading={loading}
            >
              保存配置
            </Button>
          </Space>
        }
      />

      {hasChanges && (
        <Alert
          message="配置已修改"
          description='您有未保存的配置更改，请点击"保存配置"按钮保存。'
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
        <Tabs defaultActiveKey="rateLimit" type="card">
          {/* 速率限制配置 */}
          <TabPane
            tab={
              <span>
                <ThunderboltOutlined />
                速率限制
              </span>
            }
            key="rateLimit"
          >
            <Card
              title={
                <Space>
                  <ThunderboltOutlined />
                  <span>速率限制配置</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => handleResetSection('rateLimit')}
                  icon={<ReloadOutlined />}
                >
                  重置
                </Button>
              }
            >
              <Paragraph type="secondary">
                配置Telegram消息发送的速率限制，防止账号被限制。建议使用默认值以确保账号安全。
              </Paragraph>

              <Form.Item
                label="每秒最大消息数"
                name={['rateLimit', 'maxPerSecond']}
                rules={[
                  { required: true, message: '请输入每秒最大消息数' },
                  { type: 'number', min: 0, max: 10, message: '必须在0-10之间' },
                ]}
                tooltip="单个账号每秒最多发送的消息数量"
              >
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="每小时最大消息数"
                name={['rateLimit', 'maxPerHour']}
                rules={[
                  { required: true, message: '请输入每小时最大消息数' },
                  { type: 'number', min: 0, max: 100, message: '必须在0-100之间' },
                ]}
                tooltip="单个账号每小时最多发送的消息数量"
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="每天最大消息数"
                name={['rateLimit', 'maxPerDay']}
                rules={[
                  { required: true, message: '请输入每天最大消息数' },
                  { type: 'number', min: 0, max: 1000, message: '必须在0-1000之间' },
                ]}
                tooltip="单个账号每天最多发送的消息数量"
              >
                <InputNumber min={0} max={1000} style={{ width: '100%' }} />
              </Form.Item>

              <Divider />

              <Form.Item
                label="最小延迟（毫秒）"
                name={['rateLimit', 'minDelayMs']}
                rules={[
                  { required: true, message: '请输入最小延迟' },
                  { type: 'number', min: 0, max: 10000, message: '必须在0-10000之间' },
                ]}
                tooltip="每次操作前的最小随机延迟时间"
              >
                <InputNumber min={0} max={10000} style={{ width: '100%' }} addonAfter="ms" />
              </Form.Item>

              <Form.Item
                label="最大延迟（毫秒）"
                name={['rateLimit', 'maxDelayMs']}
                rules={[
                  { required: true, message: '请输入最大延迟' },
                  { type: 'number', min: 0, max: 30000, message: '必须在0-30000之间' },
                ]}
                tooltip="每次操作前的最大随机延迟时间"
              >
                <InputNumber min={0} max={30000} style={{ width: '100%' }} addonAfter="ms" />
              </Form.Item>
            </Card>
          </TabPane>

          {/* 日志配置 */}
          <TabPane
            tab={
              <span>
                <FileTextOutlined />
                日志
              </span>
            }
            key="log"
          >
            <Card
              title={
                <Space>
                  <FileTextOutlined />
                  <span>日志配置</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => handleResetSection('log')}
                  icon={<ReloadOutlined />}
                >
                  重置
                </Button>
              }
            >
              <Paragraph type="secondary">
                配置系统日志的保留策略。过期的日志将被自动清理以节省存储空间。
              </Paragraph>

              <Form.Item
                label="日志保留天数"
                name={['log', 'retentionDays']}
                rules={[
                  { required: true, message: '请输入日志保留天数' },
                  { type: 'number', min: 1, max: 365, message: '必须在1-365之间' },
                ]}
                tooltip="超过此天数的日志将被自动清理"
              >
                <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
              </Form.Item>
            </Card>
          </TabPane>

          {/* 数据库配置 */}
          <TabPane
            tab={
              <span>
                <DatabaseOutlined />
                数据库
              </span>
            }
            key="database"
          >
            <Card
              title={
                <Space>
                  <DatabaseOutlined />
                  <span>数据库配置</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => handleResetSection('database')}
                  icon={<ReloadOutlined />}
                >
                  重置
                </Button>
              }
            >
              <Paragraph type="secondary">
                配置SQLite数据库文件的存储路径。修改此配置需要重启系统才能生效。
              </Paragraph>

              <Form.Item
                label="数据库路径"
                name={['database', 'path']}
                rules={[{ required: true, message: '请输入数据库路径' }]}
                tooltip="SQLite数据库文件的存储路径"
              >
                <Input disabled style={{ width: '100%' }} />
              </Form.Item>

              <Alert
                message="注意"
                description="数据库路径配置为只读，修改需要手动编辑配置文件并重启系统。"
                type="info"
                showIcon
              />
            </Card>
          </TabPane>

          {/* WebSocket配置 */}
          <TabPane
            tab={
              <span>
                <GlobalOutlined />
                WebSocket
              </span>
            }
            key="websocket"
          >
            <Card
              title={
                <Space>
                  <GlobalOutlined />
                  <span>WebSocket配置</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => handleResetSection('websocket')}
                  icon={<ReloadOutlined />}
                >
                  重置
                </Button>
              }
            >
              <Paragraph type="secondary">
                配置WebSocket服务器端口。修改此配置需要重启系统才能生效。
              </Paragraph>

              <Form.Item
                label="WebSocket端口"
                name={['websocket', 'port']}
                rules={[
                  { required: true, message: '请输入WebSocket端口' },
                  { type: 'number', min: 1024, max: 65535, message: '必须在1024-65535之间' },
                ]}
                tooltip="WebSocket服务器监听端口"
              >
                <InputNumber disabled min={1024} max={65535} style={{ width: '100%' }} />
              </Form.Item>

              <Alert
                message="注意"
                description="端口配置为只读，修改需要手动编辑配置文件并重启系统。"
                type="info"
                showIcon
              />
            </Card>
          </TabPane>

          {/* API配置 */}
          <TabPane
            tab={
              <span>
                <ApiOutlined />
                API服务器
              </span>
            }
            key="api"
          >
            <Card
              title={
                <Space>
                  <ApiOutlined />
                  <span>API服务器配置</span>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => handleResetSection('api')}
                  icon={<ReloadOutlined />}
                >
                  重置
                </Button>
              }
            >
              <Paragraph type="secondary">
                配置API服务器端口。修改此配置需要重启系统才能生效。
              </Paragraph>

              <Form.Item
                label="API端口"
                name={['api', 'port']}
                rules={[
                  { required: true, message: '请输入API端口' },
                  { type: 'number', min: 1024, max: 65535, message: '必须在1024-65535之间' },
                ]}
                tooltip="API服务器监听端口"
              >
                <InputNumber disabled min={1024} max={65535} style={{ width: '100%' }} />
              </Form.Item>

              <Alert
                message="注意"
                description="端口配置为只读，修改需要手动编辑配置文件并重启系统。"
                type="info"
                showIcon
              />
            </Card>
          </TabPane>
        </Tabs>
      </Form>
    </PageContainer>
  );
};

export default Settings;
