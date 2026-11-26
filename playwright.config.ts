import { defineConfig, devices } from '@playwright/test';
import { CHAVE_PUBLICA_TESTE } from './apps/api/test/licenca-teste';

/**
 * E2E do JAT Quote. Sobe o build de produção (API servindo o site) na porta 3399,
 * apontando para o banco de TESTE.
 */
try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

const PORT = 3399;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'demo/**',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
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
      LICENCA_CHAVE_TESTE: CHAVE_PUBLICA_TESTE,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
