import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local', 'app.localhost']
  },
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
