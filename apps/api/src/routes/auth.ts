import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { registrarAuditoria } from '../lib/audit.js';
import { HttpError, requisicaoInvalida } from '../lib/errors.js';
import {
  hashParaUsuarioInexistente,
  hashSenha,
  validarSenha,
  verificarSenha,
} from '../lib/password.js';
import { exigir, type registrarAuth } from '../plugins/auth.js';

/** 5 tentativas erradas seguidas bloqueiam a conta por 15 minutos. */
export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário.').max(60),
  password: z.string().min(1, 'Informe a senha.').max(200),
});

const trocaSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string(),
});

type Sessoes = ReturnType<typeof registrarAuth>;

export function authRoutes(db: Db, sessoes: Sessoes, loginRateLimit = 20) {
  return async (app: FastifyInstance) => {
    app.post(
      '/api/auth/login',
      { config: { rateLimit: { max: loginRateLimit, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const { username, password } = loginSchema.parse(req.body);
        const login = username.toLowerCase();
        const user = await db.user.findUnique({ where: { username: login } });
        const invalido = () => new HttpError(401, 'Usuário ou senha inválidos.');

        if (!user) {
          await verificarSenha(await hashParaUsuarioInexistente(), password);
          await registrarAuditoria(db, req, {
            action: 'LOGIN_FALHOU',
            entity: 'sessao',
            username: login,
            userId: null,
            details: { motivo: 'usuario_inexistente' },
          });
          throw invalido();
        }

        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          await registrarAuditoria(db, req, {
            action: 'LOGIN_BLOQUEADO',
            entity: 'sessao',
            userId: user.id,
            username: user.username,
          });
          throw new HttpError(
            423,
            `Acesso bloqueado por excesso de tentativas. Tente novamente em ${BLOQUEIO_MINUTOS} minutos ou peça ao Admin para redefinir sua senha.`,
          );
        }

        const ok = await verificarSenha(user.passwordHash, password);
        if (!ok || !user.active) {
          if (!ok) {
            const falhas = user.failedLoginCount + 1;
            const bloquear = falhas >= MAX_TENTATIVAS;
            await db.user.update({
              where: { id: user.id },
              data: {
                failedLoginCount: bloquear ? 0 : falhas,
                lockedUntil: bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000) : null,
              },
            });
          }
          await registrarAuditoria(db, req, {
            action: 'LOGIN_FALHOU',
            entity: 'sessao',
            userId: user.id,
            username: user.username,
            details: { motivo: ok ? 'usuario_inativo' : 'senha_incorreta' },
          });
          if (ok && !user.active) {
            throw new HttpError(403, 'Usuário desativado. Procure o Admin.');
          }
          throw invalido();
        }

        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await sessoes.criarSessao(req, reply, user.id);
        await registrarAuditoria(db, req, {
          action: 'LOGIN',
          entity: 'sessao',
          userId: user.id,
          username: user.username,
        });
        return {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            canEditRates: user.canEditRates,
            mustChangePassword: user.mustChangePassword,
          },
        };
      },
    );

    app.post('/api/auth/logout', async (req, reply) => {
      if (req.sessionId) {
        await db.session.delete({ where: { id: req.sessionId } }).catch(() => undefined);
        await registrarAuditoria(db, req, { action: 'LOGOUT', entity: 'sessao' });
      }
      sessoes.limparCookie(reply);
      return { status: 'ok' };
    });

    app.get(
      '/api/auth/me',
      { preHandler: exigir({ permiteTrocaPendente: true }) },
      async (req) => ({
        user: req.user,
      }),
    );

    app.post(
      '/api/auth/change-password',
      { preHandler: exigir({ permiteTrocaPendente: true }) },
      async (req) => {
        const { currentPassword, newPassword } = trocaSchema.parse(req.body);
        const u = req.user!;
        const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
        if (!(await verificarSenha(user.passwordHash, currentPassword))) {
          throw requisicaoInvalida('Senha atual incorreta.', 'currentPassword');
        }
        const problema = validarSenha(newPassword);
        if (problema) throw requisicaoInvalida(problema, 'newPassword');
        if (currentPassword === newPassword) {
          throw requisicaoInvalida('A nova senha deve ser diferente da atual.', 'newPassword');
        }
        await db.$transaction([
          db.user.update({
            where: { id: u.id },
            data: { passwordHash: await hashSenha(newPassword), mustChangePassword: false },
          }),
          // Encerra as outras sessões do usuário.
          db.session.deleteMany({ where: { userId: u.id, id: { not: req.sessionId! } } }),
        ]);
        await registrarAuditoria(db, req, {
          action: 'SENHA_ALTERADA',
          entity: 'usuario',
          entityId: u.id,
        });
        return { status: 'ok', user: { ...u, mustChangePassword: false } };
      },
    );
  };
}
