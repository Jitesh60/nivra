import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/generated/**'] },
  },
});
