import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { conflito, naoEncontrado } from '../lib/errors.js';
import { exigir } from '../plugins/auth.js';

const opcional = (max: number, msg?: string) =>
  z
    .string()
    .trim()
    .max(max, msg ?? `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v))
    .nullish();

const documentoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === 11 || v.length === 14, {
    message: 'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
  })
  .transform((v) => (v === '' ? null : v))
  .nullish();

const clienteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cliente.').max(160),
  document: documentoSchema,
  contact: opcional(120),
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .pipe(z.email('E-mail inválido.').nullable())
    .nullish(),
  phone: opcional(40),
  notes: opcional(2000),
});

const listaQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
});

const idParam = z.object({ id: z.uuid('Identificador inválido.') });

/** Nome igual a outro cliente ATIVO (sem diferenciar maiúsculas) não é permitido. */
async function garantirNomeUnico(db: Db, nome: string, ignorarId?: string) {
  const candidatos = await db.client.findMany({
    where: { active: true, name: { equals: nome, mode: 'insensitive' } },
    select: { id: true },
  });
  if (candidatos.some((c) => c.id !== ignorarId)) {
    throw conflito('Já existe um cliente ativo com esse nome.', 'name');
  }
}

export function clientRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const admin = { preHandler: exigir({ admin: true }) };

    app.get('/api/clients', logado, async (req) => {
      const { search, status } = listaQuery.parse(req.query);
      const where: Prisma.ClientWhereInput = {};
      if (status !== 'todos') where.active = status === 'ativos';
      if (search) {
        const digitos = search.replace(/\D/g, '');
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { contact: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(digitos.length >= 3 ? [{ document: { contains: digitos } }] : []),
        ];
      }
      const clients = await db.client.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
      return { clients };
    });

    app.get('/api/clients/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const client = await db.client.findUnique({ where: { id } });
      if (!client) throw naoEncontrado('Cliente');
      return { client };
    });

    app.post('/api/clients', logado, async (req, reply) => {
      const dados = clienteSchema.parse(req.body);
      await garantirNomeUnico(db, dados.name);
      const client = await db.client.create({
        data: {
          name: dados.name,
          document: dados.document ?? null,
          contact: dados.contact ?? null,
          email: dados.email ?? null,
          phone: dados.phone ?? null,
          notes: dados.notes ?? null,
        },
      });
      await registrarAuditoria(db, req, {
        action: 'CRIAR',
        entity: 'cliente',
        entityId: client.id,
        details: { name: client.name },
      });
      return reply.code(201).send({ client });
    });

    app.patch('/api/clients/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const dados = clienteSchema.partial().parse(req.body);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      if (dados.name !== undefined && antes.active) await garantirNomeUnico(db, dados.name, id);
      const depois = await db.client.update({ where: { id }, data: dados });
      const mudancas = diferencas(antes, depois);
      if (Object.keys(mudancas).length > 0) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'cliente',
          entityId: id,
          details: mudancas,
        });
      }
      return { client: depois };
    });

    /** "Excluir" = desativar (soft delete). Somente Admin. */
    app.post('/api/clients/:id/deactivate', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      const client = await db.client.update({ where: { id }, data: { active: false } });
      if (antes.active) {
        await registrarAuditoria(db, req, {
          action: 'DESATIVAR',
          entity: 'cliente',
          entityId: id,
          details: { name: client.name },
        });
      }
      return { client };
    });

    app.post('/api/clients/:id/reactivate', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      if (!antes.active) await garantirNomeUnico(db, antes.name, id);
      const client = await db.client.update({ where: { id }, data: { active: true } });
      if (!antes.active) {
        await registrarAuditoria(db, req, {
          action: 'REATIVAR',
          entity: 'cliente',
          entityId: id,
          details: { name: client.name },
        });
      }
      return { client };
    });
  };
}
