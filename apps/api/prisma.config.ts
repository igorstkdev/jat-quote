import { defineConfig, env } from 'prisma/config';

// Carrega o .env da raiz do monorepo (se existir).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* sem .env: usa variáveis de ambiente do sistema */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
