import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Button, message, Alert, Space } from 'antd';
import { TeamOutlined, SoundOutlined } from '@ant-design/icons';
import { targetsApi } from '../../services/api/targets';

interface AddTargetModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddTargetModal: React.FC<AddTargetModalProps> = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [targetType, setTargetType] = useState<'group' | 'channel'>('group');

  const resetState = () => {
    form.resetFields();
    setTargetType('group');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

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

  return (
    <Modal
      title="手动添加目标"
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical" initialValues={{ type: 'group' }}>
        <Alert
          message="添加说明"
          description="已关闭群组发现，请手动输入频道或群组的 Telegram ID（或 @用户名）进行添加。"
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
          label="频道/群组 Telegram ID"
          rules={[
            { required: true, message: '请输入 Telegram ID' },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                if (/^-?\d+$/.test(value) || /^@[a-zA-Z0-9_]{5,32}$/.test(value)) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('请输入有效的 Telegram ID（数字或@用户名）'));
              },
            },
          ]}
        >
          <Input
            placeholder={
              targetType === 'group' ? '-1001234567890 或 @mygroup' : '-1001234567890 或 @mychannel'
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
    </Modal>
  );
};

export default AddTargetModal;
