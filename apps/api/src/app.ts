import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { healthRoutes } from './routes/health.js';

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions['logger'];
  /** Pasta do frontend compilado. Se existir, o Fastify serve o site (produção). */
  webDist?: string;
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp({ db, logger = false, webDist = defaultWebDist }: AppOptions) {
  const app = Fastify({ logger });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        status: 'erro',
        message: 'Dados inválidos.',
        issues: error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    app.log.error({ err: error }, 'Erro não tratado');
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      status: 'erro',
      message: statusCode >= 500 ? 'Erro interno do servidor.' : (error as Error).message,
    });
  });

  await app.register(healthRoutes(db));

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
