import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset URLs: the build works from any path (GitHub Pages serves it under /Bone-2D/)
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5273, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  build: { target: 'es2022', sourcemap: true },
});
