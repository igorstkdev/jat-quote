import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';
import { registrarAuditoria } from '../lib/audit.js';
import { requisicaoInvalida } from '../lib/errors.js';
import { dadosDashboard, dashboardSchema } from '../lib/dashboard.js';
import { INCLUIR_COTACAO, quoteDto } from '../lib/quotes.js';
import {
  estatisticas,
  filtrosSpotSchema,
  listaSpotSchema,
  planilhaSpot,
  whereSpot,
} from '../lib/relatorio.js';
import { exigir } from '../plugins/auth.js';

/** Acima disso a exportação pede para refinar os filtros (planilha gerada em memória). */
export const MAX_LINHAS_EXCEL = 20_000;

export function reportRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };

    /** Relatório Spot: página de cotações + estatísticas do conjunto filtrado. */
    app.get('/api/reports/spot', logado, async (req) => {
      const q = listaSpotSchema.parse(req.query);
      const where = whereSpot(q);
      const ordem =
        q.sort === 'createdAt'
          ? [{ createdAt: q.dir }]
          : [{ [q.sort]: q.dir }, { createdAt: 'desc' as const }];
      const [stats, quotes] = await Promise.all([
        estatisticas(db, where),
        db.quote.findMany({
          where,
          include: INCLUIR_COTACAO,
          orderBy: ordem,
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);
      return { quotes: quotes.map(quoteDto), page: q.page, pageSize: q.pageSize, stats };
    });

    /** Excel das cotações filtradas (uso interno: inclui custos e markup). */
    app.get('/api/reports/spot/export', logado, async (req, reply) => {
      const filtros = filtrosSpotSchema.parse(req.query);
      const where = whereSpot(filtros);
      const stats = await estatisticas(db, where);
      if (stats.count > MAX_LINHAS_EXCEL) {
        throw requisicaoInvalida(
          `São ${stats.count.toLocaleString('pt-BR')} cotações. Refine os filtros para exportar no máximo ${MAX_LINHAS_EXCEL.toLocaleString('pt-BR')}.`,
        );
      }
      const cotacoes = await db.quote.findMany({
        where,
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const xlsx = await planilhaSpot(cotacoes, filtros, stats, req.user!.name);
      await registrarAuditoria(db, req, {
        action: 'EXPORTAR',
        entity: 'cotacao',
        details: { relatorio: 'spot', filtros, linhas: cotacoes.length },
      });
      const data = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="cotacoes-spot-${data}.xlsx"`)
        .send(xlsx);
    });

    app.get('/api/dashboard', logado, async (req) => {
      return dadosDashboard(db, dashboardSchema.parse(req.query));
    });
  };
}
