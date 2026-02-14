import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, Space, message, Tag, Tooltip, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { templatesApi } from '../../services/api/templates';
import type { TemplateVariable } from '../../types/template';

const { Option } = Select;
const { TextArea } = Input;

interface TemplateFormProps {
  visible: boolean;
  templateId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 模板创建/编辑表单
 */
const TemplateForm: React.FC<TemplateFormProps> = ({ visible, templateId, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState<string[]>(['']);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);

  const isEdit = !!templateId;

  // 加载模板数据（编辑模式）
  useEffect(() => {
    if (visible && templateId) {
      loadTemplate();
    } else if (visible) {
      // 创建模式，重置表单
      form.resetFields();
      setContents(['']);
      setVariables([]);
    }
  }, [visible, templateId]);

  const loadTemplate = async () => {
    if (!templateId) return;

    try {
      setLoading(true);
      const template = await templatesApi.getById(templateId);

      form.setFieldsValue({
        name: template.name,
        category: template.category,
      });

      // 设置内容列表
      if (template.contents && template.contents.length > 0) {
        setContents(template.contents);
      } else if (template.content) {
        setContents([template.content]);
      }

      // 设置变量
      if (template.variables) {
        setVariables(template.variables);
      }
    } catch (error) {
      message.error('加载模板失败');
      console.error('Failed to load template:', error);
    } finally {
      setLoading(false);
    }
  };

  // 添加内容项
  const handleAddContent = () => {
    setContents([...contents, '']);
  };

  // 删除内容项
  const handleRemoveContent = (index: number) => {
    if (contents.length <= 1) {
      message.warning('至少需要保留一个内容项');
      return;
    }
    const newContents = contents.filter((_, i) => i !== index);
    setContents(newContents);
  };

  // 更新内容项
  const handleContentChange = (index: number, value: string) => {
    const newContents = [...contents];
    newContents[index] = value;
    setContents(newContents);
  };

  // 添加变量
  const handleAddVariable = () => {
    setVariables([
      ...variables,
      {
        name: '',
        type: 'time',
      },
    ]);
  };

  // 删除变量
  const handleRemoveVariable = (index: number) => {
    const newVariables = variables.filter((_, i) => i !== index);
    setVariables(newVariables);
  };

  // 更新变量
  const handleVariableChange = (index: number, field: keyof TemplateVariable, value: string) => {
    const newVariables = [...variables];
    const currentVar = newVariables[index];

    if (!currentVar) return;

    if (field === 'name') {
      newVariables[index] = {
        name: value,
        type: currentVar.type,
        format: currentVar.format,
      };
    } else if (field === 'type') {
      newVariables[index] = {
        name: currentVar.name,
        type: value as 'time' | 'date' | 'random' | 'custom',
        format: currentVar.format,
      };
    } else if (field === 'format') {
      newVariables[index] = {
        name: currentVar.name,
        type: currentVar.type,
        format: value,
      };
    }

    setVariables(newVariables);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      await form.validateFields();

      // 验证内容列表
      const validContents = contents.filter((c) => c.trim());
      if (validContents.length === 0) {
        message.error('请至少添加一个内容项');
        return;
      }

      setLoading(true);

      const values = form.getFieldsValue();
      const data = {
        name: values.name,
        category: values.category,
        contents: validContents,
        variables: variables.filter((v) => v.name.trim()),
      };

      if (isEdit && templateId) {
        await templatesApi.update(templateId, data);
        message.success('模板更新成功');
      } else {
        await templatesApi.create(data);
        message.success('模板创建成功');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      const errorMsg = error?.response?.data?.message || '操作失败';
      message.error(errorMsg);
      console.error('Failed to save template:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? '编辑模板' : '创建模板'}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          {isEdit ? '更新' : '创建'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="模板名称"
          name="name"
          rules={[{ required: true, message: '请输入模板名称' }]}
        >
          <Input placeholder="请输入模板名称" />
        </Form.Item>

        <Form.Item
          label="模板分类"
          name="category"
          rules={[{ required: true, message: '请选择模板分类' }]}
        >
          <Select placeholder="请选择模板分类" disabled={isEdit}>
            <Option value="group_message">群组消息</Option>
            <Option value="channel_comment">频道评论</Option>
          </Select>
        </Form.Item>

        <Divider orientation="left">
          内容列表
          <Tooltip title="系统会从内容列表中随机选择一条发送">
            <InfoCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
          </Tooltip>
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {contents.map((content, index) => (
            <Space key={index} style={{ width: '100%' }} align="start">
              <TextArea
                value={content}
                onChange={(e) => handleContentChange(index, e.target.value)}
                placeholder={`内容 ${index + 1}`}
                rows={3}
                style={{ width: 650 }}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveContent(index)}
                disabled={contents.length <= 1}
              />
            </Space>
          ))}
        </Space>

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddContent}
          style={{ width: '100%', marginTop: 16 }}
        >
          添加内容
        </Button>

        <Divider orientation="left">
          变量配置（可选）
          <Tooltip title="在内容中使用 {变量名} 来引用变量">
            <InfoCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
          </Tooltip>
        </Divider>

        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Tag color="blue">可用变量：</Tag>
            <Tag>{'{time}'} - 当前时间</Tag>
            <Tag>{'{date}'} - 当前日期</Tag>
            <Tag>{'{random}'} - 随机数</Tag>
          </Space>
        </div>

        {variables.length > 0 && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {variables.map((variable, index) => (
              <Space key={index} style={{ width: '100%' }}>
                <Input
                  value={variable.name}
                  onChange={(e) => handleVariableChange(index, 'name', e.target.value)}
                  placeholder="变量名"
                  style={{ width: 150 }}
                />
                <Select
                  value={variable.type}
                  onChange={(value) => handleVariableChange(index, 'type', value)}
                  style={{ width: 120 }}
                >
                  <Option value="time">时间</Option>
                  <Option value="date">日期</Option>
                  <Option value="random">随机数</Option>
                  <Option value="custom">自定义</Option>
                </Select>
                {variable.type === 'custom' && (
                  <Input
                    value={variable.format}
                    onChange={(e) => handleVariableChange(index, 'format', e.target.value)}
                    placeholder="格式"
                    style={{ width: 200 }}
                  />
                )}
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveVariable(index)}
                />
              </Space>
            ))}
          </Space>
        )}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddVariable}
          style={{ width: '100%', marginTop: 16 }}
        >
          添加自定义变量
        </Button>
      </Form>
    </Modal>
  );
};

export default TemplateForm;
