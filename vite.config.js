import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: 'client',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./client/src', import.meta.url)) },
  },
  build: {
    outDir: '../client/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 개발 중에는 Vite가 /api 요청을 Express(4000)로 넘긴다.
    // 운영에서는 Express가 빌드된 정적 파일까지 직접 서빙하므로 프록시가 필요 없다.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
