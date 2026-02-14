import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 确保logs目录存在
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

const isTestEnv = process.env['NODE_ENV'] === 'test';
const fileTransports = !isTestEnv
  ? [
      // 所有日志文件
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // 错误日志文件
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ]
  : [];

// 创建logger实例
export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      silent: isTestEnv,
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
    ...fileTransports,
  ],
});

// 开发环境下输出更详细的日志
if (!isTestEnv && process.env['NODE_ENV'] !== 'production') {
  logger.level = 'debug';
}

export default logger;
