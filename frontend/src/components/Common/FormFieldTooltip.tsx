import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

interface FormFieldTooltipProps {
  title: string;
  placement?: 'top' | 'left' | 'right' | 'bottom';
}

/**
 * 表单字段提示组件
 * 用于在表单字段旁边显示帮助信息
 */
const FormFieldTooltip: React.FC<FormFieldTooltipProps> = ({ title, placement = 'top' }) => {
  return (
    <Tooltip title={title} placement={placement}>
      <QuestionCircleOutlined
        style={{
          marginLeft: 4,
          color: '#8c8c8c',
          cursor: 'help',
        }}
      />
    </Tooltip>
  );
};

export default FormFieldTooltip;
