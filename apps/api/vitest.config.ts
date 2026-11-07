import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['@jat/source'] },
  ssr: { resolve: { conditions: ['@jat/source'] } },
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
  },
});
