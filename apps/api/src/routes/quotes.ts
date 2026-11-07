import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { conflito, naoEncontrado } from '../lib/errors.js';
import { gerarPdfCotacao } from '../lib/pdf.js';
import { prepararSpot, quoteDto, spotSchema } from '../lib/quotes.js';
import { exigir } from '../plugins/auth.js';

const idParam = z.object({ id: z.uuid('Identificador inválido.') });
const listaQuery = z.object({
  mine: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
const pdfQuery = z.object({ visao: z.enum(['cliente', 'operacao']).default('cliente') });

const incluir = {
  createdBy: { select: { name: true, username: true } },
  updatedBy: { select: { name: true, username: true } },
  client: { select: { email: true, active: true } },
} satisfies Prisma.QuoteInclude;

export function quoteRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };

    async function buscar(id: string) {
      const q = await db.quote.findFirst({ where: { id, deletedAt: null }, include: incluir });
      if (!q) throw naoEncontrado('Cotação');
      return q;
    }

    /** Cotações Spot recentes (painel da calculadora). */
    app.get('/api/quotes', logado, async (req) => {
      const { mine, limit, search } = listaQuery.parse(req.query);
      const where: Prisma.QuoteWhereInput = {
        deletedAt: null,
        modal: { in: ['AEREO', 'RODOVIARIO'] },
        ...(mine === '1' ? { createdById: req.user!.id } : {}),
      };
      if (search) {
        const n = Number(search.replace(/\D/g, ''));
        where.OR = [
          { clientName: { contains: search, mode: 'insensitive' } },
          { originCity: { contains: search, mode: 'insensitive' } },
          { destCity: { contains: search, mode: 'insensitive' } },
          ...(Number.isFinite(n) && n > 0 ? [{ number: n }] : []),
        ];
      }
      const quotes = await db.quote.findMany({
        where,
        include: incluir,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return { quotes: quotes.map(quoteDto) };
    });

    app.get('/api/quotes/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      return { quote: quoteDto(await buscar(id)) };
    });

    app.post('/api/quotes', logado, async (req, reply) => {
      const entrada = spotSchema.parse(req.body);
      const { data } = await prepararSpot(db, entrada);
      const u = req.user!;
      const quote = await db.$transaction(async (tx) => {
        const q = await tx.quote.create({
          data: { ...data, status: 'PENDENTE', createdById: u.id },
          include: incluir,
        });
        await tx.quoteStatusChange.create({
          data: { quoteId: q.id, fromStatus: null, toStatus: 'PENDENTE', userId: u.id },
        });
        await registrarAuditoria(tx, req, {
          action: 'CRIAR',
          entity: 'cotacao',
          entityId: q.id,
          details: { numero: q.number, cliente: q.clientName, total: q.total.toString() },
        });
        return q;
      });
      return reply.code(201).send({ quote: quoteDto(quote) });
    });

    app.patch('/api/quotes/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await buscar(id);
      if (antes.status === 'APROVADA') {
        throw conflito(
          'Cotação aprovada não pode ser editada. Use "Duplicar como nova" para fazer uma nova versão.',
        );
      }
      const entrada = spotSchema.parse(req.body);
      const { data } = await prepararSpot(db, entrada, antes.clientId);
      const depois = await db.quote.update({
        where: { id },
        data: { ...data, updatedById: req.user!.id },
        include: incluir,
      });
      const mudancas = diferencas(antes, depois, [
        'updatedAt',
        'createdAt',
        'updatedById',
        'createdBy',
        'updatedBy',
        'client',
      ]);
      if (Object.keys(mudancas).length > 0) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'cotacao',
          entityId: id,
          details: { numero: depois.number, ...mudancas },
        });
      }
      return { quote: quoteDto(depois) };
    });

    /** "Duplicar como nova": nova cotação Pendente com os mesmos dados, recalculada. */
    app.post('/api/quotes/:id/duplicate', logado, async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const o = await buscar(id);
      const u = req.user!;
      const quote = await db.$transaction(async (tx) => {
        const q = await tx.quote.create({
          data: {
            modal: o.modal,
            status: 'PENDENTE',
            clientId: o.clientId,
            clientName: o.clientName,
            originCity: o.originCity,
            originUf: o.originUf,
            destCity: o.destCity,
            destUf: o.destUf,
            costRoad: o.costRoad,
            costPickup: o.costPickup,
            costAir: o.costAir,
            costDelivery: o.costDelivery,
            toll: o.toll,
            markupPct: o.markupPct,
            adValoremPct: o.adValoremPct,
            goodsValue: o.goodsValue,
            costTotal: o.costTotal,
            markupTotal: o.markupTotal,
            subtotal: o.subtotal,
            total: o.total,
            notes: o.notes,
            ftlRateId: o.ftlRateId,
            ftlRateVersion: o.ftlRateVersion,
            ftlLocality: o.ftlLocality,
            vehicle: o.vehicle,
            distanceKm: o.distanceKm,
            ratePerKm: o.ratePerKm,
            duplicatedFromId: o.id,
            createdById: u.id,
          },
          include: incluir,
        });
        await tx.quoteStatusChange.create({
          data: { quoteId: q.id, fromStatus: null, toStatus: 'PENDENTE', userId: u.id },
        });
        await registrarAuditoria(tx, req, {
          action: 'CRIAR',
          entity: 'cotacao',
          entityId: q.id,
          details: { numero: q.number, duplicadaDe: o.number },
        });
        return q;
      });
      return reply.code(201).send({ quote: quoteDto(quote) });
    });

    /** PDF: visão do cliente (sem custos internos) ou da operação (como o app atual). */
    app.get('/api/quotes/:id/pdf', logado, async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const { visao } = pdfQuery.parse(req.query);
      const q = await buscar(id);
      const pdf = await gerarPdfCotacao(q, visao, req.user!.name);
      const nome = `cotacao-${quoteDto(q).code}${visao === 'operacao' ? '-operacao' : ''}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${nome}"`)
        .header('Cache-Control', 'no-store')
        .send(pdf);
    });
  };
}
