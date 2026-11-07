import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ErroValidacao } from '@jat/core';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { z, ZodError } from 'zod';
import type { Db } from './db.js';
import { HttpError } from './lib/errors.js';
import { registrarAuth } from './plugins/auth.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/clients.js';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { userRoutes } from './routes/users.js';

// Mensagens padrão do Zod em português.
z.config(z.locales.pt());

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions['logger'];
  /** Pasta do frontend compilado. Se existir, o Fastify serve o site (produção). */
  webDist?: string;
  /** Horas sem uso até a sessão expirar (padrão 12). */
  sessionTtlHours?: number;
  /** Cookie só via HTTPS. Na rede local (http) fica false. */
  cookieSecure?: boolean;
  /** Atrás de proxy reverso: usa X-Forwarded-For para o IP. */
  trustProxy?: boolean;
  /** Tentativas de login por minuto por IP (padrão 20). */
  loginRateLimit?: number;
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp({
  db,
  logger = false,
  webDist = defaultWebDist,
  sessionTtlHours = 12,
  cookieSecure = false,
  trustProxy = false,
  loginRateLimit = 20,
}: AppOptions) {
  const app = Fastify({ logger, trustProxy });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      const primeiro = error.issues[0];
      return reply.code(400).send({
        status: 'erro',
        message: primeiro?.message ?? 'Dados inválidos.',
        campo: primeiro?.path.join('.') || undefined,
        issues: error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    if (error instanceof ErroValidacao) {
      return reply.code(400).send({ status: 'erro', message: error.message, campo: error.campo });
    }
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send({ status: 'erro', message: error.message, campo: error.campo });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode === 429) {
      return reply
        .code(429)
        .send({ status: 'erro', message: 'Muitas tentativas. Aguarde um minuto e tente de novo.' });
    }
    if (statusCode >= 500) req.log.error({ err: error }, 'Erro não tratado');
    return reply.code(statusCode).send({
      status: 'erro',
      message: statusCode >= 500 ? 'Erro interno do servidor.' : 'Requisição inválida.',
    });
  });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  const sessoes = registrarAuth(app, { db, sessionTtlHours, cookieSecure });

  await app.register(healthRoutes(db));
  await app.register(authRoutes(db, sessoes, loginRateLimit));
  await app.register(userRoutes(db));
  await app.register(clientRoutes(db));
  await app.register(settingsRoutes(db));
  await app.register(auditRoutes(db));

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    // SPA: rotas que não são /api devolvem o index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ status: 'erro', message: 'Recurso não encontrado.' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) =>
      reply.code(404).send({ status: 'erro', message: 'Recurso não encontrado.' }),
    );
  }

  return app;
}
