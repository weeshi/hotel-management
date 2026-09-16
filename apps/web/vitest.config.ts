import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/services/**/*.ts', 'src/lib/utils/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
