import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5184,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8001',
    },
    fs: {
      allow: ['../..'],
    },
  },
  optimizeDeps: {
    exclude: ['@truv-demo/design-system'],
  },
});
