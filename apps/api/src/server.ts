import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ db, logger: { level: env.LOG_LEVEL } });

async function shutdown(signal: string) {
  app.log.info(`Recebido ${signal}, encerrando...`);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
