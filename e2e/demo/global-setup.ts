import { execSync } from 'node:child_process';

/** Recria os dados fictícios da demonstração no banco de TESTE. */
export default function globalSetup() {
  execSync('node --conditions=@jat/source --import tsx src/seed-demo-cli.ts', {
    cwd: 'apps/api',
    stdio: 'inherit',
    env: { ...process.env, EDICAO: 'demo', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
  });
}
