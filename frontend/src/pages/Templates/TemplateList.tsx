import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message, Popconfirm, Tooltip, Select } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTemplateStore } from '../../stores/template';
import { templatesApi } from '../../services/api/templates';
import type { Template } from '../../types/template';
import { PageHeader } from '../../components/Layout';
import { TemplateForm, TemplatePreview } from '../../components/Template';

const { Option } = Select;

/**
 * 模板列表页面
 */
const TemplateList: React.FC = () => {
  const { templates, setTemplates, removeTemplate, setLoading, loading } = useTemplateStore();
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'message' | 'comment'>('all');
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // 加载模板列表
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await templatesApi.getAll();
      setTemplates(data);
    } catch (error) {
      message.error('加载模板列表失败');
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新模板列表
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTemplates();
    setRefreshing(false);
    message.success('刷新成功');
  };

  // 删除模板（带引用检查）
  const handleDelete = async (templateId: string) => {
    try {
      await templatesApi.delete(templateId);
      removeTemplate(templateId);
      message.success('模板删除成功');
    } catch (error: any) {
      // 如果模板被引用，后端会返回错误
      const errorMsg = error?.response?.data?.message || '删除模板失败';
      if (errorMsg.includes('引用') || errorMsg.includes('使用中')) {
        message.error('该模板正在被任务使用，无法删除');
      } else {
        message.error(errorMsg);
      }
      console.error('Failed to delete template:', error);
    }
  };

  // 预览模板
  const handlePreview = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setPreviewVisible(true);
  };

  // 编辑模板
  const handleEdit = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFormVisible(true);
  };

  // 创建新模板
  const handleCreate = () => {
    setSelectedTemplateId(null);
    setFormVisible(true);
  };

  // 表单成功回调
  const handleFormSuccess = () => {
    loadTemplates();
  };

  // 分类标签渲染
  const renderCategoryTag = (category: Template['category']) => {
    const categoryConfig = {
      group_message: {
        color: 'blue',
        text: '群组消息',
      },
      channel_comment: {
        color: 'green',
        text: '频道评论',
      },
    };

    const config = categoryConfig[category];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列定义
  const columns: ColumnsType<Template> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      render: (name) => name || '未命名模板',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category) => renderCategoryTag(category),
    },
    {
      title: '内容数量',
      key: 'contentCount',
      width: 100,
      render: (_, record) => {
        const count = record.contents?.length || (record.content ? 1 : 0);
        return count;
      },
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 100,
      render: (count) => count || 0,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled) => (
        <Tag color={enabled !== false ? 'success' : 'default'}>
          {enabled !== false ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
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
          <Tooltip title="预览">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record.id)}
            >
              预览
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record.id)}
            >
              编辑
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="删除模板后无法恢复，确定要删除吗？"
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

  // 应用分类过滤
  useEffect(() => {
    if (categoryFilter === 'all') {
      setFilteredTemplates(templates);
    } else {
      const category = categoryFilter === 'message' ? 'group_message' : 'channel_comment';
      setFilteredTemplates(templates.filter((t) => t.category === category));
    }
  }, [templates, categoryFilter]);

  // 初始化加载
  useEffect(() => {
    loadTemplates();
  }, []);

  return (
    <div>
      <PageHeader
        title="模板管理"
        subTitle="管理消息和评论模板"
        extra={
          <Space>
            <Select value={categoryFilter} onChange={setCategoryFilter} style={{ width: 120 }}>
              <Option value="all">全部分类</Option>
              <Option value="message">群组消息</Option>
              <Option value="comment">频道评论</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建模板
            </Button>
          </Space>
        }
      />

      <Table
        columns={columns}
        dataSource={filteredTemplates}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个模板`,
        }}
        scroll={{ x: 1200 }}
      />

      <TemplateForm
        visible={formVisible}
        templateId={selectedTemplateId}
        onClose={() => {
          setFormVisible(false);
          setSelectedTemplateId(null);
        }}
        onSuccess={handleFormSuccess}
      />

      <TemplatePreview
        visible={previewVisible}
        templateId={selectedTemplateId}
        onClose={() => {
          setPreviewVisible(false);
          setSelectedTemplateId(null);
        }}
      />
    </div>
  );
};

export default TemplateList;
