import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Radio,
  Button,
  message,
  Alert,
  Space,
  Tabs,
  Select,
  Table,
  Tag,
} from 'antd';
import { TeamOutlined, SoundOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { targetsApi } from '../../services/api/targets';
import { accountsApi } from '../../services/api/accounts';
import type { Account } from '../../types/account';
import type { DiscoveredTarget } from '../../types/target';

interface AddTargetModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddTargetModal: React.FC<AddTargetModalProps> = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [targetType, setTargetType] = useState<'group' | 'channel'>('group');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchAccountId, setSearchAccountId] = useState<string>();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DiscoveredTarget[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [addingBatch, setAddingBatch] = useState(false);

  const selectedItems = useMemo(
    () => searchResults.filter((item) => selectedRowKeys.includes(item.telegramId)),
    [searchResults, selectedRowKeys]
  );

  const resetState = () => {
    form.resetFields();
    setTargetType('group');
    setSearchKeyword('');
    setSearchResults([]);
    setSelectedRowKeys([]);
    setAddingBatch(false);
    setSearchLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const loadAccounts = async () => {
    try {
      const all = await accountsApi.getAll();
      setAccounts(all);
      const online = all.find((account) => account.status === 'online');
      setSearchAccountId(online?.id || all[0]?.id);
    } catch {
      message.error('加载账号列表失败');
    }
  };

  useEffect(() => {
    if (visible) {
      void loadAccounts();
    }
  }, [visible]);

  const handleSubmit = async (values: {
    type: 'group' | 'channel';
    telegramId: string;
    inviteLink?: string;
    title: string;
  }) => {
    try {
      setLoading(true);
      await targetsApi.create({
        type: values.type,
        telegramId: values.telegramId,
        inviteLink: values.inviteLink,
        title: values.title,
      });
      message.success('目标添加成功');
      handleClose();
      onSuccess();
    } catch (error) {
      const err = error as Error;
      message.error(err.message || '添加目标失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchAccountId) {
      message.warning('请先选择账号');
      return;
    }

    try {
      setSearchLoading(true);
      const items = await targetsApi.search({
        accountId: searchAccountId,
        keyword: searchKeyword,
        limit: 100,
      });
      setSearchResults(items);
      setSelectedRowKeys([]);
      message.success(`搜索完成，共 ${items.length} 条`);
    } catch (error) {
      const err = error as Error;
      message.error(err.message || '搜索失败');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleBatchAdd = async () => {
    if (selectedItems.length === 0) {
      message.warning('请先勾选要添加的目标');
      return;
    }

    try {
      setAddingBatch(true);
      const result = await targetsApi.batchAdd(selectedItems);
      message.success(
        `已新增 ${result.summary.created} 个，重复 ${result.summary.duplicated} 个，失败 ${result.summary.failed} 个`
      );
      onSuccess();
      setSelectedRowKeys([]);
    } catch (error) {
      const err = error as Error;
      message.error(err.message || '批量添加失败');
    } finally {
      setAddingBatch(false);
    }
  };

  return (
    <Modal
      title="添加目标"
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={820}
      destroyOnClose
    >
      <Tabs
        items={[
          {
            key: 'manual',
            label: '手动添加',
            children: (
              <Form
                form={form}
                onFinish={handleSubmit}
                layout="vertical"
                initialValues={{ type: 'group' }}
              >
                <Alert
                  message="添加说明"
                  description="支持手动录入 Telegram ID 或 @用户名，适合已知目标。"
                  type="info"
                  showIcon
                  style={{ marginBottom: 24 }}
                />

                <Form.Item
                  name="type"
                  label="目标类型"
                  rules={[{ required: true, message: '请选择目标类型' }]}
                >
                  <Radio.Group
                    onChange={(e) => setTargetType(e.target.value)}
                    size="large"
                    buttonStyle="solid"
                  >
                    <Radio.Button value="group">
                      <Space>
                        <TeamOutlined />
                        群组
                      </Space>
                    </Radio.Button>
                    <Radio.Button value="channel">
                      <Space>
                        <SoundOutlined />
                        频道
                      </Space>
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Form.Item
                  name="telegramId"
                  label="Telegram ID"
                  rules={[
                    { required: true, message: '请输入Telegram ID' },
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        if (/^-?\d+$/.test(value) || /^@[a-zA-Z0-9_]{5,32}$/.test(value)) {
                          return Promise.resolve();
                        }
                        return Promise.reject(
                          new Error('请输入有效的Telegram ID（数字或@用户名）')
                        );
                      },
                    },
                  ]}
                >
                  <Input
                    placeholder={
                      targetType === 'group'
                        ? '-1001234567890 或 @mygroup'
                        : '-1001234567890 或 @mychannel'
                    }
                    size="large"
                  />
                </Form.Item>

                <Form.Item name="inviteLink" label="邀请链接（可选）">
                  <Input placeholder="例如 https://t.me/+AbCdEf123456" size="large" allowClear />
                </Form.Item>

                <Form.Item
                  name="title"
                  label="名称"
                  rules={[
                    { required: true, message: '请输入名称' },
                    { min: 2, message: '名称至少2个字符' },
                  ]}
                >
                  <Input placeholder="例如：技术交流群" size="large" />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button onClick={handleClose}>取消</Button>
                    <Button type="primary" htmlType="submit" loading={loading} size="large">
                      添加目标
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'search',
            label: '搜索并添加',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Alert
                  message="按账号搜索"
                  description="基于所选账号当前可见的群组/频道进行搜索，勾选后可一键加入目标列表。"
                  type="info"
                  showIcon
                />

                <Space wrap>
                  <Select
                    style={{ minWidth: 260 }}
                    placeholder="选择账号"
                    value={searchAccountId}
                    onChange={setSearchAccountId}
                    options={accounts.map((account) => ({
                      label: `${account.phoneNumber} (${account.status})`,
                      value: account.id,
                    }))}
                  />
                  <Input
                    style={{ width: 260 }}
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="关键词（名称/ID/用户名）"
                    onPressEnter={handleSearch}
                  />
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    loading={searchLoading}
                    onClick={handleSearch}
                  >
                    搜索
                  </Button>
                  <Button
                    icon={<PlusOutlined />}
                    type="default"
                    loading={addingBatch}
                    onClick={handleBatchAdd}
                    disabled={selectedItems.length === 0}
                  >
                    一键加入已选（{selectedItems.length}）
                  </Button>
                </Space>

                <Table<DiscoveredTarget>
                  rowKey="telegramId"
                  size="small"
                  loading={searchLoading}
                  dataSource={searchResults}
                  pagination={{ pageSize: 8 }}
                  rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                  }}
                  columns={[
                    {
                      title: '类型',
                      dataIndex: 'type',
                      width: 90,
                      render: (type: DiscoveredTarget['type']) => (
                        <Tag color={type === 'group' ? 'blue' : 'purple'}>
                          {type === 'group' ? '群组' : '频道'}
                        </Tag>
                      ),
                    },
                    { title: '名称', dataIndex: 'title' },
                    { title: 'Telegram ID', dataIndex: 'telegramId', width: 180 },
                    {
                      title: '用户名',
                      dataIndex: 'username',
                      width: 180,
                      render: (value?: string) => (value ? `@${value}` : '-'),
                    },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default AddTargetModal;
