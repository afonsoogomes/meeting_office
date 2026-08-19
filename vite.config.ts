import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      '/ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
      },
      '/voice': {
        target: 'http://127.0.0.1:8787',
      },
      '/offices': {
        target: 'http://127.0.0.1:8787',
      },
      '/health': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
  build: {
    target: 'es2022',
  },
});
