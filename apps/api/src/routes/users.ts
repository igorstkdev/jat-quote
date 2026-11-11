import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { User } from '../generated/prisma/client.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { conflito, naoEncontrado, requisicaoInvalida } from '../lib/errors.js';
import { gerarSenhaTemporaria, hashSenha } from '../lib/password.js';
import { usernameSchema } from '../lib/usuarios.js';
import { exigir } from '../plugins/auth.js';

const nomeSchema = z.string().trim().min(2, 'Informe o nome.').max(120);
const roleSchema = z.enum(['ADMIN', 'OPERACIONAL'], { error: 'Perfil inválido.' });

const criarSchema = z.object({
  username: usernameSchema,
  name: nomeSchema,
  role: roleSchema.default('OPERACIONAL'),
  canEditRates: z.boolean().default(false),
});

const editarSchema = z.object({
  name: nomeSchema.optional(),
  role: roleSchema.optional(),
  canEditRates: z.boolean().optional(),
  active: z.boolean().optional(),
});

const idParam = z.object({ id: z.uuid('Identificador inválido.') });

export function publico(u: User) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    canEditRates: u.canEditRates,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    locked: !!u.lockedUntil && u.lockedUntil.getTime() > Date.now(),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function userRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const admin = { preHandler: exigir({ admin: true }) };

    app.get('/api/users', admin, async () => {
      const users = await db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
      return { users: users.map(publico) };
    });

    app.post('/api/users', admin, async (req, reply) => {
      const dados = criarSchema.parse(req.body);
      if (await db.user.findUnique({ where: { username: dados.username } })) {
        throw conflito('Já existe um usuário com esse login.', 'username');
      }
      const senhaTemporaria = gerarSenhaTemporaria();
      const user = await db.user.create({
        data: {
          ...dados,
          passwordHash: await hashSenha(senhaTemporaria),
          mustChangePassword: true,
        },
      });
      await registrarAuditoria(db, req, {
        action: 'CRIAR',
        entity: 'usuario',
        entityId: user.id,
        details: {
          username: user.username,
          name: user.name,
          role: user.role,
          canEditRates: user.canEditRates,
        },
      });
      // A senha temporária é mostrada UMA vez ao Admin e nunca mais.
      return reply.code(201).send({ user: publico(user), senhaTemporaria });
    });

    app.patch('/api/users/:id', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const dados = editarSchema.parse(req.body);
      const antes = await db.user.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Usuário');

      const eu = req.user!.id === id;
      if (eu && dados.active === false) {
        throw requisicaoInvalida('Você não pode desativar o próprio usuário.', 'active');
      }
      if (eu && dados.role && dados.role !== 'ADMIN') {
        throw requisicaoInvalida('Você não pode remover o seu próprio perfil de Admin.', 'role');
      }
      const deixaDeSerAdminAtivo =
        antes.role === 'ADMIN' &&
        antes.active &&
        (dados.active === false || (dados.role !== undefined && dados.role !== 'ADMIN'));
      if (deixaDeSerAdminAtivo) {
        const admins = await db.user.count({ where: { role: 'ADMIN', active: true } });
        if (admins <= 1)
          throw requisicaoInvalida('O sistema precisa de pelo menos um Admin ativo.');
      }

      const depois = await db.user.update({ where: { id }, data: dados });
      if (dados.active === false) await db.session.deleteMany({ where: { userId: id } });

      const mudancas = diferencas(antes, depois);
      if (Object.keys(mudancas).length > 0) {
        const action =
          dados.active === false && antes.active
            ? 'DESATIVAR'
            : dados.active === true && !antes.active
              ? 'REATIVAR'
              : 'EDITAR';
        await registrarAuditoria(db, req, {
          action,
          entity: 'usuario',
          entityId: id,
          details: mudancas,
        });
      }
      return { user: publico(depois) };
    });

    app.post('/api/users/:id/reset-password', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const user = await db.user.findUnique({ where: { id } });
      if (!user) throw naoEncontrado('Usuário');
      const senhaTemporaria = gerarSenhaTemporaria();
      await db.$transaction([
        db.user.update({
          where: { id },
          data: {
            passwordHash: await hashSenha(senhaTemporaria),
            mustChangePassword: true,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        }),
        db.session.deleteMany({ where: { userId: id } }),
      ]);
      await registrarAuditoria(db, req, {
        action: 'SENHA_REDEFINIDA',
        entity: 'usuario',
        entityId: id,
        details: { username: user.username },
      });
      return { senhaTemporaria };
    });
  };
}
