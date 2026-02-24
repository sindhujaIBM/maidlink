import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In local dev, proxy API calls to avoid CORS issues when services run on different ports
    proxy: {
      '/api/auth':    { target: 'http://localhost:3001', rewrite: path => path.replace(/^\/api\/auth/, '') },
      '/api/users':   { target: 'http://localhost:3002', rewrite: path => path.replace(/^\/api\/users/, '') },
      '/api/booking': { target: 'http://localhost:3003', rewrite: path => path.replace(/^\/api\/booking/, '') },
      '/api/admin':   { target: 'http://localhost:3004', rewrite: path => path.replace(/^\/api\/admin/, '') },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
