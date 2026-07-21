import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Прокси /api → Flask (порт 5060), чтобы фронт ходил по относительным путям
// и не упирался в CORS во время разработки.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5060',
        changeOrigin: true,
      },
    },
  },
})
