import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'core',
    include: ['src/**/*.test.ts'],
    // O núcleo de cálculo precisa de 100% de cobertura (CLAUDE.md §2).
    // Rode com: npm run test:core
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
