import { useEffect, useState } from 'react';
import { Modal, Descriptions, Tag, Spin, message, Button, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { accountsApi } from '../../services/api/accounts';
import type { Account } from '../../types/account';

interface AccountDetailModalProps {
  accountId: string | null;
  visible: boolean;
  onClose: () => void;
  onExport?: (accountId: string) => void;
}

/**
 * 账号详情对话框
 */
const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  accountId,
  visible,
  onClose,
  onExport,
}) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载账号详情
  const loadAccountDetail = async () => {
    if (!accountId) return;

    try {
      setLoading(true);
      const data = await accountsApi.getById(accountId);
      setAccount(data);
    } catch (error) {
      message.error('加载账号详情失败');
      console.error('Failed to load account detail:', error);
    } finally {
      setLoading(false);
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

  // 处理导出
  const handleExport = () => {
    if (account && onExport) {
      onExport(account.id);
    }
  };

  useEffect(() => {
    if (visible && accountId) {
      loadAccountDetail();
    }
  }, [visible, accountId]);

  return (
    <Modal
      title="账号详情"
      open={visible}
      onCancel={onClose}
      width={700}
      footer={
        <Space>
          {account && onExport && (
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              导出会话文件
            </Button>
          )}
          <Button type="primary" onClick={onClose}>
            关闭
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
        </div>
      ) : account ? (
        <Descriptions bordered column={2}>
          <Descriptions.Item label="手机号" span={2}>
            {account.phoneNumber}
          </Descriptions.Item>
          <Descriptions.Item label="显示名称" span={2}>
            {getDisplayName(account)}
          </Descriptions.Item>
          <Descriptions.Item label="用户名" span={2}>
            {account.username || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="名字">{account.firstName || '-'}</Descriptions.Item>
          <Descriptions.Item label="姓氏">{account.lastName || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态" span={2}>
            {renderStatusTag(account.status)}
          </Descriptions.Item>
          <Descriptions.Item label="最后活跃时间" span={2}>
            {new Date(account.lastActive).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="添加时间" span={2}>
            {new Date(account.createdAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>
            {new Date(account.updatedAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>暂无数据</div>
      )}
    </Modal>
  );
};

export default AccountDetailModal;
