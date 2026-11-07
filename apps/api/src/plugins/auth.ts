import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Db } from '../db.js';
import type { Role } from '../generated/prisma/client.js';
import { HttpError, naoAutenticado, semPermissao } from '../lib/errors.js';

export const COOKIE_SESSAO = 'jat_sessao';
/** Cabeçalho exigido em toda requisição que altera dados (proteção contra CSRF). */
export const CABECALHO_CSRF = 'x-jat-requested';

export interface UsuarioSessao {
  id: string;
  username: string;
  name: string;
  role: Role;
  canEditRates: boolean;
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: UsuarioSessao | null;
    sessionId: string | null;
  }
}

export interface AuthOptions {
  db: Db;
  sessionTtlHours: number;
  cookieSecure: boolean;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Registra a leitura da sessão em toda requisição e a proteção contra CSRF. */
export function registrarAuth(app: FastifyInstance, opts: AuthOptions) {
  const { db } = opts;
  const ttlMs = opts.sessionTtlHours * 3600_000;

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    const metodo = req.method.toUpperCase();
    if (
      req.url.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(metodo) &&
      req.headers[CABECALHO_CSRF] !== '1'
    ) {
      throw new HttpError(403, 'Requisição bloqueada por segurança. Recarregue a página.');
    }

    const token = req.cookies[COOKIE_SESSAO];
    if (!token) return;
    const id = hashToken(token);
    const sessao = await db.session.findUnique({ where: { id }, include: { user: true } });
    const agora = Date.now();
    if (!sessao || sessao.expiresAt.getTime() <= agora || !sessao.user.active) {
      if (sessao) await db.session.delete({ where: { id } }).catch(() => undefined);
      return;
    }
    req.sessionId = id;
    req.user = {
      id: sessao.user.id,
      username: sessao.user.username,
      name: sessao.user.name,
      role: sessao.user.role,
      canEditRates: sessao.user.canEditRates,
      mustChangePassword: sessao.user.mustChangePassword,
    };
    // Expiração deslizante: 12 h sem uso. Atualiza no máximo 1x por minuto.
    if (agora - sessao.lastSeenAt.getTime() > 60_000) {
      await db.session.update({
        where: { id },
        data: { lastSeenAt: new Date(agora), expiresAt: new Date(agora + ttlMs) },
      });
    }
  });

  return {
    async criarSessao(req: FastifyRequest, reply: FastifyReply, userId: string) {
      const token = randomBytes(32).toString('base64url');
      const agora = Date.now();
      // Limpeza oportunista de sessões vencidas.
      await db.session.deleteMany({ where: { expiresAt: { lt: new Date(agora) } } });
      await db.session.create({
        data: {
          id: hashToken(token),
          userId,
          expiresAt: new Date(agora + ttlMs),
          ip: req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        },
      });
      reply.setCookie(COOKIE_SESSAO, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.cookieSecure,
        maxAge: opts.sessionTtlHours * 3600,
      });
    },
    limparCookie(reply: FastifyReply) {
      reply.clearCookie(COOKIE_SESSAO, { path: '/' });
    },
  };
}

export interface RegraAcesso {
  /** Somente Admin. */
  admin?: boolean;
  /** Admin ou "Pode editar tarifas". */
  editarTarifas?: boolean;
  /** Permite acesso mesmo com troca de senha pendente. */
  permiteTrocaPendente?: boolean;
}

/** preHandler que exige login e, opcionalmente, um perfil/permissão. Checado no servidor. */
export function exigir(regra: RegraAcesso = {}): preHandlerHookHandler {
  return async (req) => {
    const u = req.user;
    if (!u) throw naoAutenticado();
    if (u.mustChangePassword && !regra.permiteTrocaPendente) {
      throw new HttpError(403, 'Troque sua senha para continuar.');
    }
    if (regra.admin && u.role !== 'ADMIN') throw semPermissao();
    if (regra.editarTarifas && u.role !== 'ADMIN' && !u.canEditRates) throw semPermissao();
  };
}
