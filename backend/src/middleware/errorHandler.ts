import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * 错误处理中间件
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 默认错误状态码和消息
  let statusCode = 500;
  let message = '服务器内部错误';
  let isOperational = false;

  // 如果是自定义错误
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // 记录错误日志
  if (!isOperational || statusCode >= 500) {
    logger.error('错误:', {
      message: err.message,
      stack: err.stack,
      statusCode,
    });
  } else {
    logger.warn('操作错误:', {
      message: err.message,
      statusCode,
    });
  }

  // 返回错误响应
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env['NODE_ENV'] === 'development' && {
        stack: err.stack,
        details: err,
      }),
    },
  });
};

/**
 * 404错误处理
 */
export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(404, '请求的资源不存在'));
};

/**
 * 异步错误包装器
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
