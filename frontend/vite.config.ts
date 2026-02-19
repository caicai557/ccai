import { defineConfig, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          const normalizedId = id.replace(/\\/g, '/').toLowerCase();
          if (
            normalizedId.includes('/antd/') ||
            normalizedId.includes('/@ant-design/') ||
            normalizedId.includes('/rc-') ||
            normalizedId.includes('/@rc-component/') ||
            normalizedId.includes('/@ctrl/tinycolor/') ||
            normalizedId.includes('/@emotion/')
          ) {
            return 'vendor-antd';
          }

          if (normalizedId.includes('/react-dom/')) {
            return 'vendor-react-dom';
          }

          if (normalizedId.includes('/react-router/') || normalizedId.includes('/@remix-run/')) {
            return 'vendor-router';
          }

          if (normalizedId.includes('/react/') || normalizedId.includes('/scheduler/')) {
            return 'vendor-react';
          }

          if (
            normalizedId.includes('/axios/') ||
            normalizedId.includes('/dayjs/') ||
            normalizedId.includes('/zustand/')
          ) {
            return 'vendor-utils';
          }
        },
      },
    },
  },
});
