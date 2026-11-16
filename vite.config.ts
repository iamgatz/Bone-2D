import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * plugin-react pre-bundles `${jsxImportSource}/jsx-runtime` like an npm package. Ours is a source module (src/i18n), and a pre-bundled
 * copy would keep an old dictionary until the dependency cache is cleared: take it out of the optimizer, so edits to ru.ts show up.
 */
const ownJsxRuntime: Plugin = {
  name: 'bone2d:own-jsx-runtime',
  config(config) {
    const include = config.optimizeDeps?.include;
    if (include) config.optimizeDeps!.include = include.filter((id) => !id.startsWith('@/i18n/'));
  },
};

export default defineConfig({
  plugins: [react({ jsxImportSource: '@/i18n' }), ownJsxRuntime],
  base: './', // relative asset URLs: the build works from any path (GitHub Pages serves it under /Bone-2D/)
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5273, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  build: { target: 'es2022', sourcemap: true },
});
