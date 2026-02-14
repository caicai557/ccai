import { Alert } from 'antd';

interface FormValidationMessageProps {
  errors: string[];
  type?: 'error' | 'warning' | 'info';
  showIcon?: boolean;
}

/**
 * 表单验证消息组件
 * 用于显示表单验证错误的汇总信息
 */
const FormValidationMessage: React.FC<FormValidationMessageProps> = ({
  errors,
  type = 'error',
  showIcon = true,
}) => {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <Alert
      message="表单验证失败"
      description={
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      }
      type={type}
      showIcon={showIcon}
      style={{ marginBottom: 16 }}
      closable
    />
  );
};

export default FormValidationMessage;
