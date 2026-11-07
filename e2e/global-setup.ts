import { execSync } from 'node:child_process';

/** Zera o banco de teste e cria usuários e dados de exemplo para o E2E. */
export default function globalSetup() {
  execSync('node --conditions=@jat/source --import tsx test/e2e-seed.ts', {
    cwd: 'apps/api',
    stdio: 'inherit',
  });
}
