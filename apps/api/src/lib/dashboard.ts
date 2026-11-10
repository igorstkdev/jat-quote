import {
  formatarCidade,
  formatarNumeroCotacao,
  hojeIso,
  mesDe,
  mesesEntre,
  taxaConversao,
} from '@jat/core';
import { z } from 'zod';
import type { Db } from '../db.js';
import { Prisma, type Locality, type Modal } from '../generated/prisma/client.js';
import { estatisticas, fimDiaSP, filtroPeriodo, inicioDiaSP } from './relatorio.js';

const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .optional();

export const dashboardSchema = z.object({
  from: dia,
  to: dia,
  modal: z.enum(['AEREO', 'RODOVIARIO', 'FTL']).optional(),
});
export type FiltrosDashboard = z.infer<typeof dashboardSchema>;

const MODAIS: Modal[] = ['AEREO', 'RODOVIARIO', 'FTL'];
/** O gráfico mensal mostra no máximo 36 meses (os mais recentes do período). */
const MAX_MESES = 36;
const LOCALIDADE: Record<Locality, string> = { CAPITAL: 'Capital', INTERIOR: 'Interior' };

/** Rota exibida no Top 10: "Cidade, UF → Cidade, UF" ou, no FTL, "Tabela FTL: UF Capital". */
export function rotuloRota(r: {
  originCity: string | null;
  originUf: string | null;
  destCity: string | null;
  destUf: string | null;
  ftlLocality: Locality | null;
}): string {
  if (r.ftlLocality) return `Tabela FTL: ${r.destUf ?? ''} ${LOCALIDADE[r.ftlLocality]}`;
  const c = (nome: string | null, uf: string | null) =>
    nome && uf ? formatarCidade({ nome, uf }) : '—';
  return `${c(r.originCity, r.originUf)} → ${c(r.destCity, r.destUf)}`;
}

/** Indicadores do Dashboard (CLAUDE.md §3.7). Spot e FTL juntos, com filtro por modal. */
export async function dadosDashboard(db: Db, f: FiltrosDashboard, agora = new Date()) {
  const hoje = hojeIso(agora);
  const base: Prisma.QuoteWhereInput = { deletedAt: null, ...(f.modal ? { modal: f.modal } : {}) };
  const where: Prisma.QuoteWhereInput = { ...base, ...filtroPeriodo(f.from, f.to) };

  const [stats, cotacoesHoje] = await Promise.all([
    estatisticas(db, where),
    db.quote.count({
      where: { ...base, createdAt: { gte: inicioDiaSP(hoje), lt: fimDiaSP(hoje) } },
    }),
  ]);
  const por = (s: string) => stats.byStatus.find((x) => x.status === s)!;
  const aprovadas = por('APROVADA');
  const declinadas = por('DECLINADA');
  const conversao = taxaConversao(aprovadas.count, declinadas.count);

  return {
    period: { from: f.from ?? null, to: f.to ?? null, today: hoje },
    kpis: {
      total: stats.count,
      today: cotacoesHoje,
      approved: aprovadas.count,
      declined: declinadas.count,
      quotedValue: stats.value,
      approvedValue: aprovadas.value,
      conversionPct: conversao?.toFixed(4) ?? null,
    },
    byStatus: stats.byStatus,
    monthly: await volumeMensal(db, f, hoje),
    topRoutes: await topRotas(db, where),
    recent: await atividadeRecente(db, f.modal),
  };
}

type LinhaMes = { mes: string; modal: Modal; n: number; v: Prisma.Decimal | null };

/** Volume mensal por modal (meses no fuso de São Paulo), com os meses vazios preenchidos. */
async function volumeMensal(db: Db, f: FiltrosDashboard, hoje: string) {
  const cond = [Prisma.sql`deleted_at IS NULL`];
  if (f.modal) cond.push(Prisma.sql`modal = ${f.modal}::"Modal"`);
  if (f.from) cond.push(Prisma.sql`created_at >= ${inicioDiaSP(f.from)}`);
  if (f.to) cond.push(Prisma.sql`created_at < ${fimDiaSP(f.to)}`);
  const linhas = await db.$queryRaw<LinhaMes[]>`
    SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
           modal, count(*)::int AS n, sum(total) AS v
      FROM quotes
     WHERE ${Prisma.join(cond, ' AND ')}
     GROUP BY 1, 2
     ORDER BY 1`;

  const primeiro = f.from ? mesDe(f.from) : (linhas[0]?.mes ?? mesDe(hoje));
  const ultimo = f.to ? mesDe(f.to) : mesDe(hoje);
  const meses = mesesEntre(primeiro, ultimo).slice(-MAX_MESES);
  return meses.map((mes) => {
    const ponto: Record<string, string | number> = { month: mes };
    for (const m of MODAIS) {
      const l = linhas.find((x) => x.mes === mes && x.modal === m);
      ponto[m] = l?.n ?? 0;
      ponto[`${m}_value`] = l?.v?.toFixed(2) ?? '0.00';
    }
    return ponto as { month: string } & Record<Modal, number> & Record<`${Modal}_value`, string>;
  });
}

/** As 10 rotas mais cotadas (desempate pelo valor). */
async function topRotas(db: Db, where: Prisma.QuoteWhereInput) {
  const grupos = await db.quote.groupBy({
    by: ['originCity', 'originUf', 'destCity', 'destUf', 'ftlLocality'],
    where,
    _count: { id: true },
    _sum: { total: true },
    orderBy: [{ _count: { id: 'desc' } }, { _sum: { total: 'desc' } }],
    take: 10,
  });
  return grupos.map((g) => ({
    route: rotuloRota(g),
    ftl: g.ftlLocality !== null,
    count: g._count.id,
    value: g._sum.total?.toFixed(2) ?? '0.00',
  }));
}

/** Últimas criações e mudanças de status (não depende do período). */
async function atividadeRecente(db: Db, modal?: Modal) {
  const eventos = await db.quoteStatusChange.findMany({
    where: { quote: { deletedAt: null, ...(modal ? { modal } : {}) } },
    orderBy: { at: 'desc' },
    take: 8,
    include: {
      user: { select: { name: true } },
      quote: {
        select: {
          id: true,
          number: true,
          modal: true,
          clientName: true,
          total: true,
          originCity: true,
          originUf: true,
          destCity: true,
          destUf: true,
          ftlLocality: true,
        },
      },
    },
  });
  return eventos.map((e) => ({
    id: e.id,
    at: e.at,
    user: e.user.name,
    from: e.fromStatus,
    to: e.toStatus,
    quote: {
      id: e.quote.id,
      code: formatarNumeroCotacao(e.quote.number),
      modal: e.quote.modal,
      client: e.quote.clientName,
      route: rotuloRota(e.quote),
      total: e.quote.total.toFixed(2),
    },
  }));
}
