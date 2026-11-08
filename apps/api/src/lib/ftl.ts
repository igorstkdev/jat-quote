import {
  chaveCabecalho,
  ehUf,
  ErroValidacao,
  escreverCsv,
  formatNumero,
  numeroNaoNegativo,
  parseNumero,
  ROTULO_VEICULO,
  VEICULOS_FTL,
  type TarifaFtl,
  type TipoLocalidade,
  type VeiculoFtl,
} from '@jat/core';
import { z } from 'zod';
import type { FtlRate, Prisma } from '../generated/prisma/client.js';
import { lerStatusCsv } from './air-rates.js';

const valor = z.union([z.string().max(30), z.number(), z.null()]).optional();

export const ROTULO_LOCALIDADE: Record<TipoLocalidade, string> = {
  CAPITAL: 'Capital',
  INTERIOR: 'Interior',
};

export const ftlRateSchema = z.object({
  uf: z.string().trim().max(2),
  region: z.string().trim().max(60, 'Região: use no máximo 60 caracteres.').default(''),
  locality: z.enum(['CAPITAL', 'INTERIOR'], { error: 'Escolha o tipo de localidade.' }),
  perKm: z.object({ UTILITARIO: valor, VAN: valor, TRES_QUARTOS: valor }).default({}),
  adValoremPct: valor,
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000, 'Observações: use no máximo 1.000 caracteres.').nullish(),
});
export type EntradaTabelaFtl = z.infer<typeof ftlRateSchema>;

export interface DadosTabelaFtl {
  uf: string;
  region: string;
  locality: TipoLocalidade;
  perKm: Record<VeiculoFtl, string>;
  adValoremPct: string;
  active: boolean;
  notes: string | null;
}

export function normalizarTabelaFtl(e: EntradaTabelaFtl): DadosTabelaFtl {
  const uf = e.uf.toUpperCase();
  if (!ehUf(uf)) throw new ErroValidacao('uf', 'Escolha uma UF válida.');
  if (!e.region) throw new ErroValidacao('region', 'Informe a região.');
  const perKm = {} as Record<VeiculoFtl, string>;
  for (const v of VEICULOS_FTL) {
    const rot = `${ROTULO_VEICULO[v]}: R$/km`;
    const n = parseNumero(e.perKm[v] ?? null, `perKm.${v}`, rot);
    if (n === null) throw new ErroValidacao(`perKm.${v}`, `${rot}: informe o valor.`);
    const d = numeroNaoNegativo(n, { campo: `perKm.${v}`, rotulo: rot });
    if (d.decimalPlaces() > 4) throw new ErroValidacao(`perKm.${v}`, `${rot}: no máximo 4 casas.`);
    perKm[v] = d.toString();
  }
  const pct = parseNumero(e.adValoremPct ?? null, 'adValoremPct', 'Ad valorem (%)');
  if (pct === null) throw new ErroValidacao('adValoremPct', 'Informe o ad valorem (%).');
  const adValorem = numeroNaoNegativo(pct, {
    campo: 'adValoremPct',
    rotulo: 'Ad valorem (%)',
    maximo: 100,
  });
  if (adValorem.decimalPlaces() > 4) {
    throw new ErroValidacao('adValoremPct', 'Ad valorem (%): no máximo 4 casas.');
  }
  return {
    uf,
    region: e.region,
    locality: e.locality,
    perKm,
    adValoremPct: adValorem.toString(),
    active: e.active,
    notes: e.notes ? e.notes : null,
  };
}

export function dadosTabelaParaPrisma(d: DadosTabelaFtl) {
  return {
    uf: d.uf,
    region: d.region,
    locality: d.locality,
    perKmUtility: d.perKm.UTILITARIO,
    perKmVan: d.perKm.VAN,
    perKm15t: d.perKm.TRES_QUARTOS,
    adValoremPct: d.adValoremPct,
    active: d.active,
    notes: d.notes,
  } satisfies Partial<Prisma.FtlRateUncheckedCreateInput>;
}

export function dadosDaTabela(r: FtlRate): DadosTabelaFtl {
  return {
    uf: r.uf,
    region: r.region,
    locality: r.locality,
    perKm: {
      UTILITARIO: r.perKmUtility.toString(),
      VAN: r.perKmVan.toString(),
      TRES_QUARTOS: r.perKm15t.toString(),
    },
    adValoremPct: r.adValoremPct.toString(),
    active: r.active,
    notes: r.notes,
  };
}

export function ftlRateDto(r: FtlRate) {
  return {
    id: r.id,
    ...dadosDaTabela(r),
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Tabela no formato do núcleo de cálculo. */
export function tarifaFtlCore(r: FtlRate): TarifaFtl {
  const d = dadosDaTabela(r);
  return {
    id: r.id,
    uf: d.uf,
    regiao: d.region,
    localidade: d.locality,
    tarifaKm: d.perKm,
    adValoremPct: d.adValoremPct,
  };
}

export const tabelasIguais = (a: DadosTabelaFtl, b: DadosTabelaFtl) =>
  JSON.stringify(a) === JSON.stringify(b);

export const mensagemTabelaAtiva = (uf: string, loc: TipoLocalidade) =>
  `Já existe uma tabela ativa para ${uf} ${ROTULO_LOCALIDADE[loc]}. Edite a existente ou desative-a antes.`;

// ───────────────────────── CSV ─────────────────────────

export const CABECALHO_CSV_FTL = [
  'UF',
  'Região',
  'Tipo',
  'Utilitário R$/Km',
  'VAN R$/Km',
  '1.5T R$/Km',
  'Ad Valorem %',
  'Status',
  'Versão',
  'Observações',
] as const;

export function csvTabelasFtl(rs: readonly FtlRate[]): string {
  const linhas = rs.map((r) => {
    const d = dadosDaTabela(r);
    return [
      d.uf,
      d.region,
      ROTULO_LOCALIDADE[d.locality],
      formatNumero(d.perKm.UTILITARIO, 2, 4),
      formatNumero(d.perKm.VAN, 2, 4),
      formatNumero(d.perKm.TRES_QUARTOS, 2, 4),
      formatNumero(d.adValoremPct, 2, 4),
      d.active ? 'Ativa' : 'Inativa',
      r.version,
      d.notes ?? '',
    ];
  });
  return '﻿' + escreverCsv([[...CABECALHO_CSV_FTL], ...linhas]);
}

export function entradaFtlDaLinhaCsv(get: (c: string) => string): EntradaTabelaFtl {
  const tipo = chaveCabecalho(get('Tipo'));
  if (tipo !== 'capital' && tipo !== 'interior') {
    throw new ErroValidacao('locality', `Tipo "${get('Tipo')}" inválido: use Capital ou Interior.`);
  }
  return {
    uf: get('UF'),
    region: get('Região'),
    locality: tipo === 'capital' ? 'CAPITAL' : 'INTERIOR',
    perKm: {
      UTILITARIO: get('Utilitário R$/Km'),
      VAN: get('VAN R$/Km'),
      TRES_QUARTOS: get('1.5T R$/Km'),
    },
    adValoremPct: get('Ad Valorem %'),
    active: lerStatusCsv(get('Status')),
    notes: get('Observações'),
  };
}
