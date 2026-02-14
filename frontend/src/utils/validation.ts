import type { Rule } from 'antd/es/form';

/**
 * 表单验证规则工具
 * 提供常用的表单验证规则
 */

/**
 * 必填验证
 */
export const required = (message: string = '此字段为必填项'): Rule => ({
  required: true,
  message,
});

/**
 * 手机号验证（国际格式）
 */
export const phoneNumber = (message: string = '请输入有效的国际格式手机号（以+开头）'): Rule => ({
  pattern: /^\+\d{10,15}$/,
  message,
});

/**
 * 验证码验证（5位数字）
 */
export const verificationCode = (message: string = '验证码为5位数字'): Rule => ({
  pattern: /^\d{5}$/,
  message,
});

/**
 * 邮箱验证
 */
export const email = (message: string = '请输入有效的邮箱地址'): Rule => ({
  type: 'email',
  message,
});

/**
 * URL验证
 */
export const url = (message: string = '请输入有效的URL地址'): Rule => ({
  type: 'url',
  message,
});

/**
 * 最小长度验证
 */
export const minLength = (min: number, message?: string): Rule => ({
  min,
  message: message || `长度不能少于${min}个字符`,
});

/**
 * 最大长度验证
 */
export const maxLength = (max: number, message?: string): Rule => ({
  max,
  message: message || `长度不能超过${max}个字符`,
});

/**
 * 长度范围验证
 */
export const lengthRange = (min: number, max: number, message?: string): Rule => ({
  min,
  max,
  message: message || `长度必须在${min}-${max}个字符之间`,
});

/**
 * 数字范围验证
 */
export const numberRange = (min: number, max: number, message?: string): Rule => ({
  type: 'number',
  min,
  max,
  message: message || `数值必须在${min}-${max}之间`,
});

/**
 * 正整数验证
 */
export const positiveInteger = (message: string = '请输入正整数'): Rule => ({
  pattern: /^[1-9]\d*$/,
  message,
});

/**
 * 非负整数验证
 */
export const nonNegativeInteger = (message: string = '请输入非负整数'): Rule => ({
  pattern: /^(0|[1-9]\d*)$/,
  message,
});

/**
 * 正数验证（包括小数）
 */
export const positiveNumber = (message: string = '请输入正数'): Rule => ({
  pattern: /^[+]?([0-9]+\.?[0-9]*|\.[0-9]+)$/,
  message,
  validator: (_, value) => {
    if (!value || parseFloat(value) > 0) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(message));
  },
});

/**
 * 概率验证（0-1之间的小数）
 */
export const probability = (message: string = '请输入0-1之间的数值'): Rule => ({
  validator: (_, value) => {
    if (value === undefined || value === null || value === '') {
      return Promise.resolve();
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 1) {
      return Promise.reject(new Error(message));
    }
    return Promise.resolve();
  },
});

/**
 * 百分比验证（0-100之间的整数）
 */
export const percentage = (message: string = '请输入0-100之间的整数'): Rule => ({
  validator: (_, value) => {
    if (value === undefined || value === null || value === '') {
      return Promise.resolve();
    }
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > 100) {
      return Promise.reject(new Error(message));
    }
    return Promise.resolve();
  },
});

/**
 * 端口号验证
 */
export const port = (message: string = '请输入有效的端口号（1-65535）'): Rule => ({
  validator: (_, value) => {
    if (value === undefined || value === null || value === '') {
      return Promise.resolve();
    }
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > 65535) {
      return Promise.reject(new Error(message));
    }
    return Promise.resolve();
  },
});

/**
 * IP地址验证
 */
export const ipAddress = (message: string = '请输入有效的IP地址'): Rule => ({
  pattern: /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  message,
});

/**
 * 用户名验证（字母、数字、下划线，3-20位）
 */
export const username = (
  message: string = '用户名只能包含字母、数字、下划线，长度3-20位'
): Rule => ({
  pattern: /^[a-zA-Z0-9_]{3,20}$/,
  message,
});

/**
 * 密码强度验证（至少8位，包含大小写字母和数字）
 */
export const strongPassword = (
  message: string = '密码至少8位，必须包含大小写字母和数字'
): Rule => ({
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  message,
});

/**
 * 确认密码验证
 */
export const confirmPassword = (
  passwordField: string = 'password',
  message: string = '两次输入的密码不一致'
): Rule => ({
  validator: (_, value, callback) => {
    const form = callback as any;
    if (!value || form.getFieldValue(passwordField) === value) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(message));
  },
});

/**
 * 自定义正则验证
 */
export const pattern = (regex: RegExp, message: string): Rule => ({
  pattern: regex,
  message,
});

/**
 * 自定义验证函数
 */
export const custom = (
  validator: (rule: any, value: any) => Promise<void>,
  message?: string
): Rule => ({
  validator,
  message,
});

/**
 * 空格验证（不允许只包含空格）
 */
export const noWhitespaceOnly = (message: string = '不能只包含空格'): Rule => ({
  validator: (_, value) => {
    if (!value || value.trim().length > 0) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(message));
  },
});

/**
 * 数组非空验证
 */
export const arrayNotEmpty = (message: string = '至少选择一项'): Rule => ({
  validator: (_, value) => {
    if (Array.isArray(value) && value.length > 0) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(message));
  },
});

/**
 * 组合验证规则
 */
export const combine = (...rules: Rule[]): Rule[] => rules;

/**
 * 常用表单验证规则组合
 */
export const commonRules = {
  // 必填 + 去除空格
  requiredTrimmed: [required(), noWhitespaceOnly()],

  // 必填 + 手机号
  requiredPhone: [required('请输入手机号'), phoneNumber()],

  // 必填 + 验证码
  requiredCode: [required('请输入验证码'), verificationCode()],

  // 必填 + 邮箱
  requiredEmail: [required('请输入邮箱'), email()],

  // 必填 + URL
  requiredUrl: [required('请输入URL'), url()],

  // 必填 + 正整数
  requiredPositiveInt: [required('请输入数值'), positiveInteger()],

  // 必填 + 非负整数
  requiredNonNegativeInt: [required('请输入数值'), nonNegativeInteger()],

  // 必填 + 数组非空
  requiredArray: [required('请至少选择一项'), arrayNotEmpty()],
};

export default {
  required,
  phoneNumber,
  verificationCode,
  email,
  url,
  minLength,
  maxLength,
  lengthRange,
  numberRange,
  positiveInteger,
  nonNegativeInteger,
  positiveNumber,
  probability,
  percentage,
  port,
  ipAddress,
  username,
  strongPassword,
  confirmPassword,
  pattern,
  custom,
  noWhitespaceOnly,
  arrayNotEmpty,
  combine,
  commonRules,
};
