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
import { quoteRoutes } from './routes/quotes.js';
import { quoteImportRoutes } from './routes/quotes-import.js';
import { airRateRoutes } from './routes/air-rates.js';
import { ftlRoutes } from './routes/ftl.js';
import { reportRoutes } from './routes/reports.js';
import { fecharNavegadorPdf } from './lib/pdf.js';
import { CHAVE_PUBLICA_LICENCA, criarControleLicenca } from './lib/licenca.js';
import { licencaRoutes, rotaLiberadaSemLicenca } from './routes/licenca.js';

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
  /**
   * Licença (plano de vigência). Padrão: chave pública oficial. `false` desliga o bloqueio
   * (só nos testes de integração das outras telas).
   */
  licenca?: { chavePublica: string; agora?: () => Date } | false;
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
  licenca = { chavePublica: CHAVE_PUBLICA_LICENCA },
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
      // Indisponibilidade (ex.: PDF) também vai para o log, com o detalhe técnico.
      if (error.statusCode >= 500) req.log.error({ err: error }, error.message);
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
      // O código do pedido aparece para o usuário e no log: facilita achar o erro depois.
      message:
        statusCode >= 500
          ? `Erro interno do servidor. Se continuar, informe o código ${req.id} ao responsável.`
          : 'Requisição inválida.',
    });
  });

  // Erro numa página aberta direto no navegador (ex.: PDF em nova aba): em vez do JSON cru,
  // uma página simples em português com a mensagem.
  app.addHook('onSend', async (req, reply, payload) => {
    if (
      reply.statusCode < 400 ||
      !req.url.startsWith('/api/') ||
      !(req.headers.accept ?? '').includes('text/html') ||
      typeof payload !== 'string'
    ) {
      return payload;
    }
    let mensagem = 'Não foi possível concluir o pedido.';
    try {
      mensagem = (JSON.parse(payload) as { message?: string }).message ?? mensagem;
    } catch {
      return payload;
    }
    reply.header('content-type', 'text/html; charset=utf-8');
    return paginaDeErro(mensagem);
  });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  const sessoes = registrarAuth(app, { db, sessionTtlHours, cookieSecure });

  const controleLicenca = criarControleLicenca(
    db,
    licenca ? licenca.chavePublica : CHAVE_PUBLICA_LICENCA,
    licenca ? licenca.agora : undefined,
  );
  if (licenca) {
    // Sistema sem licença válida: só a tela de ativação funciona.
    app.addHook('onRequest', async (req, reply) => {
      if (rotaLiberadaSemLicenca(req.url)) return;
      const estado = await controleLicenca.estado();
      if (estado.bloqueado) {
        return reply.code(423).send({
          status: 'erro',
          codigo: 'LICENCA_BLOQUEADA',
          message: `Sistema bloqueado. ${estado.mensagem}`,
        });
      }
    });
  }

  await app.register(healthRoutes(db));
  await app.register(licencaRoutes(db, controleLicenca));
  await app.register(authRoutes(db, sessoes, loginRateLimit));
  await app.register(userRoutes(db));
  await app.register(clientRoutes(db));
  await app.register(settingsRoutes(db));
  await app.register(auditRoutes(db));
  await app.register(quoteImportRoutes(db));
  await app.register(quoteRoutes(db));
  await app.register(airRateRoutes(db));
  await app.register(ftlRoutes(db));
  await app.register(reportRoutes(db));
  app.addHook('onClose', fecharNavegadorPdf);

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

const escHtml = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Página mínima de erro (sem dependências), no padrão visual do sistema. */
function paginaDeErro(mensagem: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>JAT Quote</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,'Segoe UI',Arial,sans-serif;background:#f7f8fb;color:#1b2235}
@media (prefers-color-scheme:dark){body{background:#0e1220;color:#e8ebf3}.c{background:#161b2c!important;border-color:#263049!important}}
.c{max-width:440px;margin:16px;padding:28px;border:1px solid #e2e6ef;border-radius:16px;background:#fff;border-top:3px solid #FD8B21}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;margin:0 0 16px;opacity:.85}button{font:inherit;font-size:14px;padding:8px 14px;border-radius:8px;border:1px solid #1F428A;background:#1F428A;color:#fff;cursor:pointer}</style></head>
<body><div class="c"><h1>Não foi possível abrir</h1><p>${escHtml(mensagem)}</p><button onclick="window.close()">Fechar esta aba</button></div></body></html>`;
}
