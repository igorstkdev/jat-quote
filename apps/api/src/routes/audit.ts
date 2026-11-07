import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { exigir } from '../plugins/auth.js';

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use aaaa-mm-dd).')
  .optional();

const consultaSchema = z.object({
  entity: z.string().max(40).optional(),
  action: z.string().max(40).optional(),
  username: z.string().trim().max(60).optional(),
  from: data,
  to: data,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

/** Converte aaaa-mm-dd (dia em São Paulo, UTC−3) para o instante UTC do início do dia. */
const inicioDiaSP = (d: string) => new Date(`${d}T00:00:00-03:00`);

export function auditRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    app.get('/api/audit', { preHandler: exigir({ admin: true }) }, async (req) => {
      const q = consultaSchema.parse(req.query);
      const where: Prisma.AuditLogWhereInput = {};
      if (q.entity) where.entity = q.entity;
      if (q.action) where.action = q.action;
      if (q.username) where.username = { contains: q.username.toLowerCase() };
      if (q.from || q.to) {
        where.at = {
          ...(q.from ? { gte: inicioDiaSP(q.from) } : {}),
          ...(q.to ? { lt: new Date(inicioDiaSP(q.to).getTime() + 86_400_000) } : {}),
        };
      }
      const [total, rows] = await Promise.all([
        db.auditLog.count({ where }),
        db.auditLog.findMany({
          where,
          orderBy: { at: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);
      return {
        total,
        page: q.page,
        pageSize: q.pageSize,
        logs: rows.map((r) => ({ ...r, id: r.id.toString() })),
      };
    });
  };
}
