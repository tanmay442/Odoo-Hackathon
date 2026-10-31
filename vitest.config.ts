import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    // Integration suites share one Postgres database and truncate it per
    // test, so files run sequentially instead of racing each other.
    fileParallelism: false,
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/setup.ts'],
  },
})
