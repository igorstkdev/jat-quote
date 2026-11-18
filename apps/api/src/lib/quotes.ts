import {
  calcularSpot,
  encontrarMunicipio,
  formatarCidade,
  formatarNumeroCotacao,
  lerCondicoes,
  type Condicoes,
  type ResultadoSpot,
} from '@jat/core';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma, Quote } from '../generated/prisma/client.js';
import { requisicaoInvalida } from './errors.js';
import { lerAdValoremPadrao, lerCondicoesFtl, lerCondicoesSpot } from './settings.js';

/** Número/texto vindo do formulário: aceita "1.234,56", "1234.56", número ou vazio. */
const valor = z.union([z.string().max(30), z.number(), z.null()]).optional();

export const spotSchema = z.object({
  clientId: z.uuid('Selecione o cliente.'),
  originCity: z.string().trim().min(1, 'Informe a cidade de origem.').max(120),
  originUf: z.string().trim().length(2, 'Informe a UF de origem.'),
  destCity: z.string().trim().min(1, 'Informe a cidade de destino.').max(120),
  destUf: z.string().trim().length(2, 'Informe a UF de destino.'),
  modal: z.enum(['AEREO', 'RODOVIARIO'], { error: 'Escolha o tipo de transporte.' }),
  costs: z.object({ RODOVIARIO: valor, COLETA: valor, AEREO: valor, ENTREGA: valor }).default({}),
  toll: valor,
  markupPct: valor,
  adValoremPct: valor,
  goodsValue: valor,
  notes: z.string().trim().max(2000, 'Observações: use no máximo 2.000 caracteres.').nullish(),
});

export type EntradaSpotApi = z.infer<typeof spotSchema>;

function cidade(nome: string, uf: string, campo: string, rotulo: string) {
  const m = encontrarMunicipio(nome, uf);
  if (!m) {
    throw requisicaoInvalida(
      `${rotulo}: "${nome}/${uf.toUpperCase()}" não está na lista de municípios do IBGE.`,
      campo,
    );
  }
  return m;
}

/** Valida cliente e cidades e RECALCULA no servidor (o total do navegador nunca é usado). */
export async function prepararSpot(db: Db, e: EntradaSpotApi, clienteAtual?: string | null) {
  const client = await db.client.findUnique({ where: { id: e.clientId } });
  if (!client) throw requisicaoInvalida('Cliente não encontrado.', 'clientId');
  if (!client.active && client.id !== clienteAtual) {
    throw requisicaoInvalida('Este cliente está desativado. Escolha outro.', 'clientId');
  }
  const origem = cidade(e.originCity, e.originUf, 'originCity', 'Origem');
  const destino = cidade(e.destCity, e.destUf, 'destCity', 'Destino');

  const r = calcularSpot({
    modal: e.modal,
    custos: e.costs,
    pedagio: e.toll,
    markupPct: e.markupPct,
    adValoremPct: e.adValoremPct,
    valorMercadoria: e.goodsValue,
    padroesAdValorem: await lerAdValoremPadrao(db),
  });

  const custo = (c: string) =>
    r.componentes.find((x) => x.componente === c)?.custo.toFixed(2) ?? null;

  const data = {
    modal: e.modal,
    clientId: client.id,
    clientName: client.name,
    originCity: origem.nome,
    originUf: origem.uf,
    destCity: destino.nome,
    destUf: destino.uf,
    costRoad: custo('RODOVIARIO'),
    costPickup: custo('COLETA'),
    costAir: custo('AEREO'),
    costDelivery: custo('ENTREGA'),
    toll: r.pedagio.toFixed(2),
    markupPct: r.markupPct.toString(),
    adValoremPct: r.adValorem.pct.toString(),
    goodsValue: r.adValorem.valorMercadoria?.toFixed(2) ?? null,
    costTotal: r.somaCustos.toFixed(2),
    markupTotal: r.markupTotal.toFixed(2),
    subtotal: r.subtotal.toFixed(2),
    total: r.total.toFixed(2),
    notes: e.notes ? e.notes : null,
    // Termos do modal copiados na hora de salvar (não mudam depois — 17/11/2026).
    terms: (await lerCondicoesSpot(db))[e.modal] as unknown as Prisma.InputJsonValue,
  } satisfies Partial<Prisma.QuoteUncheckedCreateInput>;

  return { data, resultado: r };
}

/** Relações carregadas junto com a cotação nas respostas da API. */
export const INCLUIR_COTACAO = {
  createdBy: { select: { name: true, username: true } },
  updatedBy: { select: { name: true, username: true } },
  client: { select: { email: true, active: true } },
  ftlRate: { select: { region: true } },
} satisfies Prisma.QuoteInclude;

type QuoteComRelacoes = Quote & {
  createdBy?: { name: string; username: string } | null;
  updatedBy?: { name: string; username: string } | null;
  client?: { email: string | null; active: boolean } | null;
  ftlRate?: { region: string } | null;
};

const s = (d: { toString(): string } | null | undefined) => (d == null ? null : d.toString());

/** Termos gravados na cotação (null em cotações anteriores a 17/11/2026). */
export function termosGravados(q: Pick<Quote, 'terms'>): Condicoes | null {
  return q.terms == null ? null : lerCondicoes(q.terms);
}

/**
 * Termos para mostrar/imprimir: os gravados; nas cotações antigas (sem termos gravados), os
 * atuais das Configurações para o modal (Spot) ou o veículo (FTL).
 */
export async function termosDaCotacao(
  db: Db,
  q: Pick<Quote, 'terms' | 'modal' | 'vehicle'>,
): Promise<Condicoes> {
  const gravados = termosGravados(q);
  if (gravados) return gravados;
  if (q.modal === 'FTL') return (await lerCondicoesFtl(db))[q.vehicle ?? 'VAN'];
  return (await lerCondicoesSpot(db))[q.modal];
}

/** Termos atuais das Configurações para uma nova cotação (ex.: "Duplicar como nova"). */
export async function termosAtuais(
  db: Db,
  q: Pick<Quote, 'modal' | 'vehicle'>,
): Promise<Prisma.InputJsonValue> {
  const c =
    q.modal === 'FTL'
      ? (await lerCondicoesFtl(db))[q.vehicle ?? 'VAN']
      : (await lerCondicoesSpot(db))[q.modal];
  return c as unknown as Prisma.InputJsonValue;
}

/** Formato da cotação nas respostas da API (Decimal → string). */
export function quoteDto(q: QuoteComRelacoes) {
  return {
    id: q.id,
    number: q.number,
    code: formatarNumeroCotacao(q.number),
    modal: q.modal,
    status: q.status,
    clientId: q.clientId,
    clientName: q.clientName,
    clientEmail: q.client?.email ?? null,
    origin:
      q.originCity && q.originUf ? formatarCidade({ nome: q.originCity, uf: q.originUf }) : null,
    originCity: q.originCity,
    originUf: q.originUf,
    dest: q.destCity && q.destUf ? formatarCidade({ nome: q.destCity, uf: q.destUf }) : null,
    destCity: q.destCity,
    destUf: q.destUf,
    costs: {
      RODOVIARIO: s(q.costRoad),
      COLETA: s(q.costPickup),
      AEREO: s(q.costAir),
      ENTREGA: s(q.costDelivery),
    },
    toll: s(q.toll),
    markupPct: s(q.markupPct),
    adValoremPct: s(q.adValoremPct),
    goodsValue: s(q.goodsValue),
    costTotal: s(q.costTotal),
    markupTotal: s(q.markupTotal),
    subtotal: s(q.subtotal),
    total: s(q.total),
    notes: q.notes,
    terms: termosGravados(q),
    isTestData: q.isTestData,
    ftl:
      q.modal === 'FTL'
        ? {
            uf: q.destUf,
            region: q.ftlRate?.region ?? '',
            locality: q.ftlLocality,
            vehicle: q.vehicle,
            distanceKm: s(q.distanceKm),
            ratePerKm: s(q.ratePerKm),
            rateVersion: q.ftlRateVersion,
          }
        : null,
    duplicatedFromId: q.duplicatedFromId,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    createdBy: q.createdBy ? { name: q.createdBy.name, username: q.createdBy.username } : null,
    updatedBy: q.updatedBy ? { name: q.updatedBy.name, username: q.updatedBy.username } : null,
  };
}

export type QuoteDto = ReturnType<typeof quoteDto>;

/** Recalcula o resultado (para PDF) a partir do que está gravado. */
export function resultadoGravado(q: Quote): ResultadoSpot {
  return calcularSpot({
    modal: q.modal === 'AEREO' ? 'AEREO' : 'RODOVIARIO',
    custos: {
      RODOVIARIO: s(q.costRoad),
      COLETA: s(q.costPickup),
      AEREO: s(q.costAir),
      ENTREGA: s(q.costDelivery),
    },
    pedagio: s(q.toll),
    markupPct: s(q.markupPct),
    adValoremPct: s(q.adValoremPct),
    valorMercadoria: s(q.goodsValue),
  });
}
