import { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, Upload, message, Space, Alert, Steps } from 'antd';
import { PhoneOutlined, UploadOutlined, SafetyOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { accountsApi } from '../../services/api/accounts';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AddMethod = 'phone' | 'session';
type PhoneLoginStep = 'phone' | 'code' | 'password' | 'success';

/**
 * 添加账号对话框
 */
const AddAccountModal: React.FC<AddAccountModalProps> = ({ visible, onClose, onSuccess }) => {
  const [addMethod, setAddMethod] = useState<AddMethod>('phone');
  const [phoneForm] = Form.useForm();
  const [codeForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // 手机号登录状态
  const [phoneLoginStep, setPhoneLoginStep] = useState<PhoneLoginStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [accountId, setAccountId] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [loading, setLoading] = useState(false);

  // 会话文件上传状态
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  // 重置状态
  const resetState = () => {
    setPhoneLoginStep('phone');
    setPhoneNumber('');
    setAccountId('');
    setPhoneCodeHash('');
    setFileList([]);
    phoneForm.resetFields();
    codeForm.resetFields();
    passwordForm.resetFields();
  };

  // 关闭对话框
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 发送验证码
  const handleSendCode = async (values: { phoneNumber: string }) => {
    try {
      setLoading(true);
      const result = await accountsApi.addByPhone(values.phoneNumber);
      setPhoneNumber(values.phoneNumber);
      setAccountId(result.accountId);
      setPhoneCodeHash(result.phoneCodeHash);
      setPhoneLoginStep('code');
      message.success('验证码已发送到您的手机');
    } catch (error: any) {
      message.error(error.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  // 验证验证码
  const handleVerifyCode = async (values: { code: string }) => {
    try {
      setLoading(true);
      await accountsApi.verifyCode(accountId, values.code, phoneCodeHash);
      setPhoneLoginStep('success');
      message.success('账号添加成功');
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1500);
    } catch (error: any) {
      // 如果需要两步验证密码
      if (error.message?.includes('两步验证') || error.message?.includes('password')) {
        setPhoneLoginStep('password');
        message.info('该账号启用了两步验证，请输入密码');
      } else {
        message.error(error.message || '验证码验证失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 验证两步验证密码
  const handleVerifyPassword = async (values: { password: string }) => {
    try {
      setLoading(true);
      await accountsApi.verifyPassword(accountId, values.password);
      setPhoneLoginStep('success');
      message.success('账号添加成功');
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1500);
    } catch (error: any) {
      message.error(error.message || '密码验证失败');
    } finally {
      setLoading(false);
    }
  };

  // 上传会话文件
  const handleUploadSession = async () => {
    if (fileList.length === 0) {
      message.warning('请选择会话文件');
      return;
    }

    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error('文件无效');
      return;
    }

    try {
      setUploading(true);
      await accountsApi.importSession(file as File);
      message.success('会话文件导入成功');
      handleClose();
      onSuccess();
    } catch (error: any) {
      message.error(error.message || '导入会话文件失败');
    } finally {
      setUploading(false);
    }
  };

  // 手机号登录步骤配置
  const phoneLoginSteps = [
    { title: '输入手机号', key: 'phone' },
    { title: '验证码', key: 'code' },
    { title: '完成', key: 'success' },
  ];

  const currentStepIndex = phoneLoginSteps.findIndex((step) => step.key === phoneLoginStep);

  // 渲染手机号登录表单
  const renderPhoneLoginForm = () => {
    return (
      <div>
        <Steps current={currentStepIndex} items={phoneLoginSteps} style={{ marginBottom: 24 }} />

        {phoneLoginStep === 'phone' && (
          <Form form={phoneForm} onFinish={handleSendCode} layout="vertical">
            <Alert
              message="提示"
              description="请输入完整的国际格式手机号，例如：+8613800138000"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="phoneNumber"
              label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                {
                  pattern: /^\+\d{10,15}$/,
                  message: '请输入有效的国际格式手机号（以+开头）',
                },
              ]}
            >
              <Input prefix={<PhoneOutlined />} placeholder="+8613800138000" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                发送验证码
              </Button>
            </Form.Item>
          </Form>
        )}

        {phoneLoginStep === 'code' && (
          <Form form={codeForm} onFinish={handleVerifyCode} layout="vertical">
            <Alert
              message="验证码已发送"
              description={`验证码已发送到 ${phoneNumber}，请查收并输入`}
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="code"
              label="验证码"
              rules={[
                { required: true, message: '请输入验证码' },
                { pattern: /^\d{5}$/, message: '验证码为5位数字' },
              ]}
            >
              <Input placeholder="请输入5位验证码" size="large" maxLength={5} autoFocus />
            </Form.Item>
            <Form.Item>
              <Space style={{ width: '100%' }} direction="vertical">
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  验证
                </Button>
                <Button onClick={() => setPhoneLoginStep('phone')} block>
                  返回重新输入手机号
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}

        {phoneLoginStep === 'password' && (
          <Form form={passwordForm} onFinish={handleVerifyPassword} layout="vertical">
            <Alert
              message="需要两步验证"
              description="该账号启用了两步验证，请输入您的两步验证密码"
              type="info"
              showIcon
              icon={<SafetyOutlined />}
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="password"
              label="两步验证密码"
              rules={[{ required: true, message: '请输入两步验证密码' }]}
            >
              <Input.Password placeholder="请输入密码" size="large" autoFocus />
            </Form.Item>
            <Form.Item>
              <Space style={{ width: '100%' }} direction="vertical">
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  验证密码
                </Button>
                <Button onClick={() => setPhoneLoginStep('code')} block>
                  返回
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}

        {phoneLoginStep === 'success' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 18, marginBottom: 8 }}>账号添加成功！</div>
            <div style={{ color: '#8c8c8c' }}>正在关闭对话框...</div>
          </div>
        )}
      </div>
    );
  };

  // 渲染会话文件导入表单
  const renderSessionImportForm = () => {
    return (
      <div>
        <Alert
          message="导入说明"
          description="请选择之前导出的 .session 会话文件进行导入"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Upload
          fileList={fileList}
          onChange={({ fileList }) => setFileList(fileList)}
          beforeUpload={() => false}
          accept=".session"
          maxCount={1}
        >
          <Button icon={<UploadOutlined />} size="large" block>
            选择会话文件
          </Button>
        </Upload>
        <div style={{ marginTop: 16 }}>
          <Button
            type="primary"
            onClick={handleUploadSession}
            loading={uploading}
            disabled={fileList.length === 0}
            block
            size="large"
          >
            导入会话文件
          </Button>
        </div>
      </div>
    );
  };

  // 标签页配置
  const tabItems = [
    {
      key: 'phone',
      label: '手机号登录',
      icon: <PhoneOutlined />,
      children: renderPhoneLoginForm(),
    },
    {
      key: 'session',
      label: '导入会话文件',
      icon: <UploadOutlined />,
      children: renderSessionImportForm(),
    },
  ];

  return (
    <Modal
      title="添加账号"
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Tabs
        activeKey={addMethod}
        onChange={(key) => {
          setAddMethod(key as AddMethod);
          resetState();
        }}
        items={tabItems}
      />
    </Modal>
  );
};

export default AddAccountModal;
