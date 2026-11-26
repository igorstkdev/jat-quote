import { defineConfig, devices } from '@playwright/test';

/**
 * E2E da EDIÇÃO DE DEMONSTRAÇÃO (25/11/2026): sobe o build com EDICAO=demo na porta 3398,
 * no banco de TESTE (o global-setup recria os dados fictícios). Rode depois do E2E principal:
 *   npm run test:e2e:demo
 */
try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

const PORT = 3398;

export default defineConfig({
  testDir: 'e2e/demo',
  globalSetup: './e2e/demo/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run db:deploy -w @jat/api && npm run start',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      LOG_LEVEL: 'warn',
      LOGIN_RATE_LIMIT: '1000',
      EDICAO: 'demo',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
