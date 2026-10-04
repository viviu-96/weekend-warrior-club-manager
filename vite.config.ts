import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tên repository = đường dẫn con của trang trên GitHub Pages (https://<user>.github.io/<repo>/).
const PAGES_BASE = '/weekend-warrior-club-manager/';

export default defineConfig(({ mode }) => ({
  // `--mode static` build bản web tĩnh cho GitHub Pages (xem .env.static).
  base: mode === 'static' ? PAGES_BASE : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
