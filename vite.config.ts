import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Локальная разработка: API-запросы идут на NestJS (в проде — системный nginx)
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    // vite preview (проверка прод-сборки локально) — тот же прокси
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
