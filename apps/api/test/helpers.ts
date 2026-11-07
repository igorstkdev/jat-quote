import type { InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import type { Role } from '../src/generated/prisma/client.js';
import { hashSenha } from '../src/lib/password.js';
import { CABECALHO_CSRF, COOKIE_SESSAO } from '../src/plugins/auth.js';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* sem .env */
}

export const SENHA = 'Senha123';

export function criarDbTeste(): Db {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL não definida.');
  return createDb(url);
}

export async function criarAppTeste(db: Db) {
  return buildApp({ db, webDist: '__inexistente__', loginRateLimit: 10_000 });
}

export type App = Awaited<ReturnType<typeof criarAppTeste>>;

/** Apaga todos os dados (mantém o histórico de migrations). */
export async function limparBanco(db: Db) {
  await db.$executeRawUnsafe(`
    truncate table audit_logs, sessions, quote_status_changes, quotes, air_rate_history, air_rates,
      ftl_rate_history, ftl_rates, clients, useful_links, settings, users restart identity cascade
  `);
}

export async function criarUsuario(
  db: Db,
  username: string,
  opts: {
    role?: Role;
    canEditRates?: boolean;
    mustChangePassword?: boolean;
    active?: boolean;
    senha?: string;
  } = {},
) {
  return db.user.create({
    data: {
      username,
      name: username.toUpperCase(),
      role: opts.role ?? 'OPERACIONAL',
      canEditRates: opts.canEditRates ?? false,
      active: opts.active ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
      passwordHash: await hashSenha(opts.senha ?? SENHA),
    },
  });
}

/** Faz login e devolve o cookie de sessão. */
export async function login(app: App, username: string, senha = SENHA): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [CABECALHO_CSRF]: '1' },
    payload: { username, password: senha },
  });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  const c = res.cookies.find((x) => x.name === COOKIE_SESSAO);
  if (!c) throw new Error('cookie de sessão ausente');
  return `${COOKIE_SESSAO}=${c.value}`;
}

/** Requisição autenticada com o cabeçalho anti-CSRF. */
export function req(app: App, cookie: string | null, opts: InjectOptions) {
  return app.inject({
    ...opts,
    headers: { [CABECALHO_CSRF]: '1', ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
  });
}
