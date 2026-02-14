import { useEffect, useState } from 'react';
import { Modal, List, Spin, message, Empty, Tag, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { templatesApi } from '../../services/api/templates';

interface TemplatePreviewProps {
  visible: boolean;
  templateId: string | null;
  onClose: () => void;
}

/**
 * 模板预览组件
 * 显示变量替换后的实际效果
 */
const TemplatePreview: React.FC<TemplatePreviewProps> = ({ visible, templateId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  // 加载预览内容
  const loadPreview = async () => {
    if (!templateId) return;

    try {
      setLoading(true);
      const data = await templatesApi.preview(templateId);
      setPreviews(data);
    } catch (error) {
      message.error('加载预览失败');
      console.error('Failed to load preview:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新预览
  const handleRefresh = () => {
    loadPreview();
  };

  // 当对话框打开时加载预览
  useEffect(() => {
    if (visible && templateId) {
      loadPreview();
    } else {
      setPreviews([]);
    }
  }, [visible, templateId]);

  return (
    <Modal
      title={
        <Space>
          <span>模板预览</span>
          <Tag color="blue">变量已替换为实际值</Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={700}
      footer={null}
    >
      <Spin spinning={loading}>
        {previews.length > 0 ? (
          <>
            <div style={{ marginBottom: 16, color: '#666' }}>
              <Space>
                <span>共 {previews.length} 条内容</span>
                <a onClick={handleRefresh}>
                  <ReloadOutlined /> 刷新预览
                </a>
              </Space>
            </div>
            <List
              dataSource={previews}
              renderItem={(item, index) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: '#999',
                        fontSize: 12,
                      }}
                    >
                      内容 {index + 1}
                    </div>
                    <div
                      style={{
                        padding: 12,
                        background: '#f5f5f5',
                        borderRadius: 4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {item}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </>
        ) : (
          !loading && <Empty description="暂无预览内容" style={{ padding: '40px 0' }} />
        )}
      </Spin>
    </Modal>
  );
};

export default TemplatePreview;
