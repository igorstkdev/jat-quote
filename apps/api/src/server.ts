import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { CHAVE_PUBLICA_LICENCA } from './lib/licenca.js';
import { verificarRecursosPdf } from './lib/pdf.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({
  db,
  logger: { level: env.LOG_LEVEL },
  sessionTtlHours: env.SESSION_TTL_HOURS,
  cookieSecure: env.COOKIE_SECURE,
  trustProxy: env.TRUST_PROXY,
  loginRateLimit: env.LOGIN_RATE_LIMIT,
  edicao: env.EDICAO,
  licenca: {
    chavePublica:
      env.NODE_ENV === 'test' && env.LICENCA_CHAVE_TESTE
        ? env.LICENCA_CHAVE_TESTE
        : CHAVE_PUBLICA_LICENCA,
  },
});

async function shutdown(signal: string) {
  app.log.info(`Recebido ${signal}, encerrando...`);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });

// Confere logo dos PDFs e Chromium logo ao subir: o problema aparece no log antes do usuário.
for (const p of verificarRecursosPdf()) app.log.warn(`PDF: ${p}`);
