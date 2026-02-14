import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Button, message, Alert, Space } from 'antd';
import { TeamOutlined, SoundOutlined } from '@ant-design/icons';
import { targetsApi } from '../../services/api/targets';

interface AddTargetModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 添加目标对话框
 */
const AddTargetModal: React.FC<AddTargetModalProps> = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [targetType, setTargetType] = useState<'group' | 'channel'>('group');

  // 重置状态
  const resetState = () => {
    form.resetFields();
    setTargetType('group');
  };

  // 关闭对话框
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 提交表单
  const handleSubmit = async (values: {
    type: 'group' | 'channel';
    telegramId: string;
    title: string;
  }) => {
    try {
      setLoading(true);
      await targetsApi.create({
        type: values.type,
        telegramId: values.telegramId,
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
      title="添加目标"
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical" initialValues={{ type: 'group' }}>
        <Alert
          message="添加说明"
          description={
            <div>
              <p>请输入要管理的群组或频道信息：</p>
              <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                <li>Telegram ID：可以是数字ID（如 -1001234567890）或用户名（如 @mychannel）</li>
                <li>名称：用于在系统中识别该目标</li>
                <li>确保您的账号有权限访问该群组或频道</li>
              </ul>
            </div>
          }
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
                // 验证格式：数字ID或@开头的用户名
                if (/^-?\d+$/.test(value) || /^@[a-zA-Z0-9_]{5,32}$/.test(value)) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('请输入有效的Telegram ID（数字或@用户名）'));
              },
            },
          ]}
          tooltip="可以是数字ID（如 -1001234567890）或用户名（如 @mychannel）"
        >
          <Input
            placeholder={
              targetType === 'group' ? '-1001234567890 或 @mygroup' : '-1001234567890 或 @mychannel'
            }
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="名称"
          rules={[
            { required: true, message: '请输入名称' },
            { min: 2, message: '名称至少2个字符' },
            { max: 100, message: '名称最多100个字符' },
          ]}
          tooltip="用于在系统中识别该目标"
        >
          <Input
            placeholder={targetType === 'group' ? '例如：技术交流群' : '例如：官方公告频道'}
            size="large"
          />
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
