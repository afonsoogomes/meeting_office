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
        timeout: 0,
        proxyTimeout: 0,
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
      '/games': {
        target: 'http://127.0.0.1:8787',
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/voice': { target: 'http://127.0.0.1:8787' },
      '/offices': { target: 'http://127.0.0.1:8787' },
      '/health': { target: 'http://127.0.0.1:8787' },
      '/games': { target: 'http://127.0.0.1:8787' },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
  },
});
