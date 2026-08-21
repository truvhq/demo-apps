import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000',
    },
    fs: {
      // libs/design-system lives outside this package's root — allow Vite to serve it.
      allow: ['../..'],
    },
  },
  // Serve the design-system workspace package as source (JSX) rather than
  // letting esbuild's dependency pre-bundling treat it as an opaque dependency.
  optimizeDeps: {
    exclude: ['@truv-demo/design-system'],
  },
});
