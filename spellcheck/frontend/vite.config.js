import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В режиме разработки проксируем /api на Flask (порт 5001),
// чтобы фронтенд и бэкенд работали как единое целое без CORS-настроек.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // strictPort: не «уезжать» на 5174/5175, если 5173 занят завис­шим
    // процессом — лучше упасть с явной ошибкой, чем молча сменить порт.
    strictPort: true,
    proxy: {
      '/api': {
        // 127.0.0.1, а не localhost — иначе на некоторых системах адрес
        // резолвится в IPv6 (::1), а Flask слушает IPv4, и прокси не отвечает.
        target: process.env.BACKEND_URL || 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
});
