import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db.js';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* sem .env */
}

const db = createDb(process.env.TEST_DATABASE_URL ?? '');
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({ db, webDist: '__inexistente__' });
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('GET /api/health', () => {
  it('responde ok e lê o PostgreSQL', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.database.connected).toBe(true);
    expect(body.database.version).toMatch(/^PostgreSQL \d+/);
    expect(typeof body.database.settings).toBe('number');
  });

  it('devolve 503 com mensagem em português quando o banco está fora', async () => {
    const broken = createDb('postgresql://ninguem:x@127.0.0.1:1/nada');
    const app2 = await buildApp({ db: broken, webDist: '__inexistente__' });
    const res = await app2.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('Não foi possível conectar ao banco de dados.');
    await app2.close();
    await broken.$disconnect();
  });

  it('rota inexistente devolve 404 em português', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Recurso não encontrado.');
  });
});
