import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// e2e tests boot the whole app against real Postgres (PostGIS) + Redis containers,
// started once per run by test/global-setup.ts via Testcontainers.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
