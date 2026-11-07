import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Aplica as migrations no banco de TESTE antes dos testes de integração. */
export default function setup() {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    /* sem .env: usa variáveis de ambiente do sistema */
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL não definida no .env (veja .env.example).');
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
