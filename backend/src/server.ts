/**
 * HTTP服务器启动和管理
 */
import http from 'http';
import { Application } from 'express';
import { getServerConfig } from './config';
import { wsManager } from './routes/ws';

/**
 * 创建HTTP服务器
 */
export function createServer(app: Application): http.Server {
  const server = http.createServer(app);

  // 初始化WebSocket服务器
  wsManager.initialize(server);

  return server;
}

/**
 * 启动服务器
 */
export async function startServer(server: http.Server): Promise<void> {
  const { port, host } = getServerConfig();

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`✓ 服务器启动成功`);
      // eslint-disable-next-line no-console
      console.log(`  - 地址: http://${host}:${port}`);
      // eslint-disable-next-line no-console
      console.log(`  - 环境: ${process.env['NODE_ENV'] || 'development'}`);
      // eslint-disable-next-line no-console
      console.log(`  - 时间: ${new Date().toLocaleString('zh-CN')}`);
      resolve();
    });

    server.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`✗ 端口 ${port} 已被占用`);
      } else {
        console.error('✗ 服务器启动失败:', error.message);
      }
      reject(error);
    });
  });
}

/**
 * 优雅关闭服务器
 */
export async function shutdownServer(server: http.Server): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n正在关闭服务器...');

  // 先关闭WebSocket服务器
  wsManager.close();

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        console.error('✗ 服务器关闭失败:', error.message);
        reject(error);
      } else {
        // eslint-disable-next-line no-console
        console.log('✓ 服务器已关闭');
        resolve();
      }
    });
  });
}
