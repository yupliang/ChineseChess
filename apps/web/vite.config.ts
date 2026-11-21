import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pikafish WASM 使用 pthreads，需要 SharedArrayBuffer，必须跨域隔离。
export const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        panel: 'panel.html',
      },
    },
  },
  server: {
    port: 5173,
    headers: crossOriginHeaders,
  },
  preview: {
    headers: crossOriginHeaders,
  },
  optimizeDeps: {
    exclude: ['@cc/engine'],
  },
});
