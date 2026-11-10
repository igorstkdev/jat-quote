import { D, formatarNumeroCotacao, ROTULO_MODAL } from '@jat/core';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma, QuoteStatus } from '../generated/prisma/client.js';

export const STATUS = ['PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA'] as const;
export const ROTULO_STATUS: Record<QuoteStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  DECLINADA: 'Declinada',
  RECUSADA: 'Recusada',
};

const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .optional();

/** Filtros do Relatório Spot (CLAUDE.md §3.6). */
export const filtrosSpotSchema = z.object({
  search: z.string().trim().max(100).optional(),
  from: dia,
  to: dia,
  status: z.enum(STATUS).optional(),
  modal: z.enum(['AEREO', 'RODOVIARIO']).optional(),
});
export type FiltrosSpot = z.infer<typeof filtrosSpotSchema>;

export const ORDENACOES = ['createdAt', 'number', 'clientName', 'total', 'status'] as const;

export const listaSpotSchema = filtrosSpotSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(ORDENACOES).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

/** Início do dia em São Paulo (sem horário de verão desde 2019: UTC−3). */
export const inicioDiaSP = (d: string) => new Date(`${d}T00:00:00-03:00`);
export const fimDiaSP = (d: string) => new Date(inicioDiaSP(d).getTime() + 86_400_000);

export function filtroPeriodo(from?: string, to?: string): Prisma.QuoteWhereInput {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: inicioDiaSP(from) } : {}),
      ...(to ? { lt: fimDiaSP(to) } : {}),
    },
  };
}

/** Busca por nº da cotação (com ou sem "JQ-"), cliente, cidade de origem ou de destino. */
export function filtroBusca(search?: string): Prisma.QuoteWhereInput {
  if (!search) return {};
  const n = /^\s*(jq-?)?\s*\d+\s*$/i.test(search) ? Number(search.replace(/\D/g, '')) : NaN;
  return {
    OR: [
      { clientName: { contains: search, mode: 'insensitive' } },
      { originCity: { contains: search, mode: 'insensitive' } },
      { destCity: { contains: search, mode: 'insensitive' } },
      ...(Number.isSafeInteger(n) && n > 0 ? [{ number: n }] : []),
    ],
  };
}

export function whereSpot(f: FiltrosSpot): Prisma.QuoteWhereInput {
  return {
    deletedAt: null,
    modal: f.modal ?? { in: ['AEREO', 'RODOVIARIO'] },
    ...(f.status ? { status: f.status } : {}),
    ...filtroPeriodo(f.from, f.to),
    ...filtroBusca(f.search),
  };
}

/** Quantidade e valor, no total e por status (somas feitas no banco, em Decimal). */
export async function estatisticas(db: Db, where: Prisma.QuoteWhereInput) {
  const grupos = await db.quote.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { total: true },
  });
  const porStatus = STATUS.map((status) => {
    const g = grupos.find((x) => x.status === status);
    return {
      status,
      count: g?._count._all ?? 0,
      value: g?._sum.total?.toFixed(2) ?? '0.00',
    };
  });
  const total = await db.quote.aggregate({ where, _count: { _all: true }, _sum: { total: true } });
  return {
    count: total._count._all,
    value: total._sum.total?.toFixed(2) ?? '0.00',
    byStatus: porStatus,
  };
}

// ───────────────────────── Excel ─────────────────────────

const AZUL_JAT = 'FF1F428A';
const FMT_BRL = '"R$" #,##0.00';
const FMT_PCT = '0.00##"%"';

/** Data/hora de São Paulo como "horário local" para o Excel (que não guarda fuso). */
function dataLocalSP(d: Date): Date {
  return new Date(d.getTime() - 3 * 3_600_000);
}

const num = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d));

type CotacaoExcel = Prisma.QuoteGetPayload<{
  include: { createdBy: { select: { name: true } } };
}>;

function descreverFiltros(f: FiltrosSpot): [string, string][] {
  const br = (d: string) => d.split('-').reverse().join('/');
  return [
    ['Busca', f.search || 'Todas'],
    [
      'Período',
      f.from || f.to
        ? `${f.from ? br(f.from) : 'início'} a ${f.to ? br(f.to) : 'hoje'}`
        : 'Todo o período',
    ],
    ['Status', f.status ? ROTULO_STATUS[f.status] : 'Todos'],
    ['Modal', f.modal ? ROTULO_MODAL[f.modal] : 'Aéreo e Rodoviário'],
  ];
}

/**
 * Planilha das cotações Spot filtradas. Uso interno: inclui custos e markup.
 * Valores como número (formato R$), para o usuário somar e filtrar no Excel.
 */
export async function planilhaSpot(
  cotacoes: CotacaoExcel[],
  filtros: FiltrosSpot,
  stats: Awaited<ReturnType<typeof estatisticas>>,
  geradoPor: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JAT Quote';
  wb.created = new Date();

  const ws = wb.addWorksheet('Cotações', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [
    { header: 'Nº', key: 'numero', width: 12 },
    { header: 'Data', key: 'data', width: 17, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'Origem', key: 'origem', width: 26 },
    { header: 'Destino', key: 'destino', width: 26 },
    { header: 'Modal', key: 'modal', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Soma dos custos', key: 'custos', width: 16, style: { numFmt: FMT_BRL } },
    { header: 'Markup %', key: 'markup', width: 11, style: { numFmt: FMT_PCT } },
    { header: 'MKUP aplicado', key: 'mkup', width: 16, style: { numFmt: FMT_BRL } },
    { header: 'Subtotal com MKUP', key: 'subtotal', width: 18, style: { numFmt: FMT_BRL } },
    { header: 'Pedágio', key: 'pedagio', width: 13, style: { numFmt: FMT_BRL } },
    { header: 'Total do frete', key: 'total', width: 16, style: { numFmt: FMT_BRL } },
    { header: 'Ad valorem %', key: 'adv', width: 13, style: { numFmt: FMT_PCT } },
    { header: 'Criada por', key: 'criador', width: 22 },
    { header: 'Observações', key: 'obs', width: 40 },
  ];

  for (const q of cotacoes) {
    ws.addRow({
      numero: formatarNumeroCotacao(q.number),
      data: dataLocalSP(q.createdAt),
      cliente: q.clientName ?? '',
      origem: q.originCity ? `${q.originCity}, ${q.originUf}` : '',
      destino: q.destCity ? `${q.destCity}, ${q.destUf}` : '',
      modal: ROTULO_MODAL[q.modal],
      status: ROTULO_STATUS[q.status],
      custos: num(q.costTotal),
      markup: num(q.markupPct),
      mkup: num(q.markupTotal),
      subtotal: num(q.subtotal),
      pedagio: num(q.toll),
      total: num(q.total),
      adv: num(q.adValoremPct),
      criador: q.createdBy.name,
      obs: q.notes ?? '',
    });
  }

  const cab = ws.getRow(1);
  cab.height = 22;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_JAT } };
    c.alignment = { vertical: 'middle' };
    c.border = { bottom: { style: 'thin', color: { argb: AZUL_JAT } } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  // Linha de totais (fórmulas, com o resultado já gravado para leitores sem cálculo).
  if (cotacoes.length > 0) {
    const ult = cotacoes.length + 1;
    const total = ws.addRow({ numero: 'Total', cliente: `${cotacoes.length} cotações` });
    const colunas = {
      custos: (q: CotacaoExcel) => q.costTotal,
      mkup: (q: CotacaoExcel) => q.markupTotal,
      subtotal: (q: CotacaoExcel) => q.subtotal,
      pedagio: (q: CotacaoExcel) => q.toll,
      total: (q: CotacaoExcel) => q.total,
    };
    for (const [chave, campo] of Object.entries(colunas)) {
      const letra = ws.getColumn(chave).letter;
      const soma = cotacoes.reduce((acc, q) => acc.plus(campo(q).toString()), D(0));
      total.getCell(chave).value = {
        formula: `SUM(${letra}2:${letra}${ult})`,
        result: soma.toNumber(),
      };
    }
    total.font = { bold: true };
    total.eachCell((c) => {
      c.border = { top: { style: 'thin' } };
    });
  }

  // Aba "Resumo": filtros usados e estatísticas por status.
  const rs = wb.addWorksheet('Resumo');
  rs.columns = [
    { key: 'a', width: 22 },
    { key: 'b', width: 30 },
    { key: 'c', width: 18, style: { numFmt: FMT_BRL } },
  ];
  rs.addRow(['JAT Quote — Relatório Spot']).font = { bold: true, size: 14 };
  rs.addRow([
    `Gerado em ${new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date())} por ${geradoPor}`,
  ]).font = { color: { argb: 'FF666666' } };
  rs.addRow([]);
  rs.addRow(['Filtros']).font = { bold: true };
  for (const [k, v] of descreverFiltros(filtros)) rs.addRow([k, v]);
  rs.addRow([]);
  const cabR = rs.addRow(['Status', 'Quantidade', 'Valor']);
  cabR.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_JAT } };
  });
  for (const s of stats.byStatus) rs.addRow([ROTULO_STATUS[s.status], s.count, Number(s.value)]);
  rs.addRow(['Total', stats.count, Number(stats.value)]).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
