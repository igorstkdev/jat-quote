import {
  chaveCabecalho,
  COMPANHIAS,
  dataIsoParaBR,
  ErroValidacao,
  escreverCsv,
  formatNumero,
  hojeIso,
  lerCsvComLinhas,
  lerData,
  NIVEIS_TARIFA,
  normalizarIata,
  numeroNaoNegativo,
  parseNumero,
  ROTULO_NIVEL,
  validarVigencia,
  vigenciasSobrepostas,
  vigenteEm,
  type Companhia,
  type DataIso,
  type NivelTarifa,
} from '@jat/core';
import { z } from 'zod';
import type { AirRate, Prisma } from '../generated/prisma/client.js';
import { requisicaoInvalida } from './errors.js';

/** Data gravada em coluna DATE → aaaa-mm-dd. */
export const isoDia = (d: Date) => d.toISOString().slice(0, 10);
/** aaaa-mm-dd → Date (meia-noite UTC), para colunas DATE. */
export const diaParaDate = (iso: DataIso) => new Date(`${iso}T00:00:00.000Z`);

const valor = z.union([z.string().max(30), z.number(), z.null()]).optional();
const nivelSchema = z.object({ perKg: valor, min: valor }).nullish();

export const airRateSchema = z.object({
  origin: z.string().trim().max(3),
  destination: z.string().trim().max(3),
  airline: z.enum(COMPANHIAS as [Companhia, ...Companhia[]], { error: 'Escolha a companhia.' }),
  validFrom: z.string().trim().max(30).nullish(),
  validTo: z.string().trim().max(30).nullish(),
  active: z.boolean().default(true),
  levels: z
    .object({ URGENTE: nivelSchema, RAPIDO: nivelSchema, ECONOMICO: nivelSchema })
    .default({}),
  notes: z.string().trim().max(1000, 'Observações: use no máximo 1.000 caracteres.').nullish(),
});
export type EntradaTarifa = z.infer<typeof airRateSchema>;

const COLUNA_NIVEL = {
  URGENTE: ['urgentPerKg', 'urgentMin'],
  RAPIDO: ['fastPerKg', 'fastMin'],
  ECONOMICO: ['economyPerKg', 'economyMin'],
} as const satisfies Record<NivelTarifa, readonly [keyof AirRate, keyof AirRate]>;

/** Dados normalizados de uma tarifa (strings decimais), prontos para gravar e comparar. */
export interface DadosTarifa {
  origin: string;
  destination: string;
  airline: Companhia;
  validFrom: DataIso;
  validTo: DataIso | null;
  active: boolean;
  levels: Record<NivelTarifa, { perKg: string; min: string } | null>;
  notes: string | null;
}

/** Valida e normaliza (IATA, vigência, níveis). Erros em português, com o campo. */
export function normalizarTarifa(e: EntradaTarifa): DadosTarifa {
  const origin = normalizarIata(e.origin, 'origin', 'Origem');
  const destination = normalizarIata(e.destination, 'destination', 'Destino');
  if (origin === destination) {
    throw new ErroValidacao('destination', 'Origem e destino precisam ser diferentes.');
  }
  const vig = validarVigencia({
    inicio: lerData(e.validFrom, 'validFrom', 'Início da vigência'),
    fim: lerData(e.validTo, 'validTo', 'Fim da vigência'),
  });

  const levels = {} as DadosTarifa['levels'];
  for (const n of NIVEIS_TARIFA) {
    const l = e.levels[n];
    const rot = ROTULO_NIVEL[n];
    const perKg = parseNumero(l?.perKg ?? null, `levels.${n}.perKg`, `${rot}: tarifa/kg`);
    const min = parseNumero(l?.min ?? null, `levels.${n}.min`, `${rot}: mínimo`);
    if (perKg === null && min === null) {
      levels[n] = null;
      continue;
    }
    if (perKg === null || min === null) {
      throw new ErroValidacao(
        `levels.${n}.${perKg === null ? 'perKg' : 'min'}`,
        `${rot}: informe a tarifa/kg e o mínimo (ou deixe os dois em branco).`,
      );
    }
    const pk = numeroNaoNegativo(perKg, {
      campo: `levels.${n}.perKg`,
      rotulo: `${rot}: tarifa/kg`,
    });
    const mn = numeroNaoNegativo(min, { campo: `levels.${n}.min`, rotulo: `${rot}: mínimo` });
    if (pk.decimalPlaces() > 4) {
      throw new ErroValidacao(`levels.${n}.perKg`, `${rot}: tarifa/kg com no máximo 4 casas.`);
    }
    levels[n] = { perKg: pk.toString(), min: mn.toFixed(2) };
  }
  if (NIVEIS_TARIFA.every((n) => levels[n] === null)) {
    throw new ErroValidacao('levels', 'Preencha ao menos um nível (Urgente, Rápido ou Econômico).');
  }
  return {
    origin,
    destination,
    airline: e.airline,
    validFrom: vig.inicio,
    validTo: vig.fim,
    active: e.active,
    levels,
    notes: e.notes ? e.notes : null,
  };
}

export function dadosParaPrisma(d: DadosTarifa) {
  const col = (n: NivelTarifa) => {
    const [kg, min] = COLUNA_NIVEL[n];
    return { [kg]: d.levels[n]?.perKg ?? null, [min]: d.levels[n]?.min ?? null };
  };
  return {
    origin: d.origin,
    destination: d.destination,
    airline: d.airline,
    validFrom: diaParaDate(d.validFrom),
    validTo: d.validTo ? diaParaDate(d.validTo) : null,
    active: d.active,
    notes: d.notes,
    ...col('URGENTE'),
    ...col('RAPIDO'),
    ...col('ECONOMICO'),
  } as Prisma.AirRateUncheckedCreateInput;
}

export function dadosDaTarifa(r: AirRate): DadosTarifa {
  const nivel = (n: NivelTarifa) => {
    const [kg, min] = COLUNA_NIVEL[n];
    const pk = r[kg] as Prisma.Decimal | null;
    const mn = r[min] as Prisma.Decimal | null;
    return pk == null || mn == null ? null : { perKg: pk.toString(), min: mn.toFixed(2) };
  };
  return {
    origin: r.origin,
    destination: r.destination,
    airline: r.airline,
    validFrom: isoDia(r.validFrom),
    validTo: r.validTo ? isoDia(r.validTo) : null,
    active: r.active,
    levels: { URGENTE: nivel('URGENTE'), RAPIDO: nivel('RAPIDO'), ECONOMICO: nivel('ECONOMICO') },
    notes: r.notes,
  };
}

/** Formato da tarifa nas respostas da API. */
export function airRateDto(r: AirRate, hoje = hojeIso()) {
  const d = dadosDaTarifa(r);
  return {
    id: r.id,
    ...d,
    version: r.version,
    /** Ativa e com vigência cobrindo hoje: é a que a calculadora usa. */
    current: r.active && vigenteEm({ inicio: d.validFrom, fim: d.validTo }, hoje),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
export type AirRateDto = ReturnType<typeof airRateDto>;

export const iguais = (a: DadosTarifa, b: DadosTarifa) => JSON.stringify(a) === JSON.stringify(b);

type ComVigencia = Pick<
  DadosTarifa,
  'origin' | 'destination' | 'airline' | 'validFrom' | 'validTo' | 'active'
>;

/**
 * Vigências sobrepostas são proibidas (CLAUDE.md §3.3) entre tarifas **ativas** da
 * mesma rota + companhia. Devolve a tarifa em conflito, se houver.
 */
export function conflitoVigencia<T extends ComVigencia>(nova: ComVigencia, outras: readonly T[]) {
  if (!nova.active) return undefined;
  return outras.find(
    (o) =>
      o.active &&
      o.origin === nova.origin &&
      o.destination === nova.destination &&
      o.airline === nova.airline &&
      vigenciasSobrepostas(
        { inicio: o.validFrom, fim: o.validTo },
        { inicio: nova.validFrom, fim: nova.validTo },
      ),
  );
}

export function mensagemConflito(o: ComVigencia) {
  const fim = o.validTo ? `até ${dataIsoParaBR(o.validTo)}` : 'sem data final';
  return (
    `Já existe uma tarifa ativa ${o.airline} ${o.origin} → ${o.destination} com vigência que se ` +
    `sobrepõe (de ${dataIsoParaBR(o.validFrom)} ${fim}). Ajuste as datas ou desative a outra tarifa.`
  );
}

// ───────────────────────── CSV (layout do app atual) ─────────────────────────

export const CABECALHO_CSV_TARIFAS = [
  'Origem',
  'Destino',
  'Companhia',
  'Urgente R$/Kg',
  'Urgente Min',
  'Rápido R$/Kg',
  'Rápido Min',
  'Econômico R$/Kg',
  'Econômico Min',
  'Status',
  'Versão',
  'Vigência Início',
  'Vigência Fim',
  'Observações',
] as const;

const num = (v: string | null | undefined, casas: number) =>
  v == null ? '' : formatNumero(v, 2, casas);

export function csvTarifas(tarifas: readonly AirRate[]): string {
  const linhas = tarifas.map((r) => {
    const d = dadosDaTarifa(r);
    const l = (n: NivelTarifa) => [num(d.levels[n]?.perKg, 4), num(d.levels[n]?.min, 2)];
    return [
      d.origin,
      d.destination,
      d.airline,
      ...l('URGENTE'),
      ...l('RAPIDO'),
      ...l('ECONOMICO'),
      d.active ? 'Ativa' : 'Inativa',
      r.version,
      dataIsoParaBR(d.validFrom),
      d.validTo ? dataIsoParaBR(d.validTo) : '',
      d.notes ?? '',
    ];
  });
  return '﻿' + escreverCsv([[...CABECALHO_CSV_TARIFAS], ...linhas]);
}

/** Lê "Ativa", "Ativo", "Inativa", "Inativo", "Sim", "Não"; vazio = ativa. */
export function lerStatusCsv(v: string | undefined): boolean {
  const k = chaveCabecalho(v ?? '');
  if (k === '' || k === 'ativa' || k === 'ativo' || k === 'sim') return true;
  if (k === 'inativa' || k === 'inativo' || k === 'nao') return false;
  throw new ErroValidacao('status', `Status "${v}" inválido: use Ativa ou Inativa.`);
}

/**
 * Separador do CSV pela 1ª linha: ";" (padrão do Excel em português e do app antigo) ou ","
 * (exportações em inglês). Na dúvida, ";".
 */
export function detectarSeparador(texto: string): ';' | ',' {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const conta = (c: string) => primeira.split(c).length - 1;
  return conta(',') > conta(';') ? ',' : ';';
}

/**
 * Confere o cabeçalho e devolve as linhas como objetos (chave = coluna normalizada).
 * Colunas a mais são ignoradas; faltando alguma obrigatória, o arquivo é recusado.
 */
export function linhasCsv(texto: string, obrigatorias: readonly string[]) {
  const [cabRegistro, ...linhas] = lerCsvComLinhas(texto, detectarSeparador(texto));
  const cab = cabRegistro?.campos;
  if (!cab) throw requisicaoInvalida('O arquivo está vazio.');
  const chaves = cab.map(chaveCabecalho);
  const faltando = obrigatorias.filter((c) => !chaves.includes(chaveCabecalho(c)));
  if (faltando.length > 0) {
    throw requisicaoInvalida(
      `O arquivo não está no formato esperado. Colunas ausentes: ${faltando.join(', ')}.`,
    );
  }
  if (linhas.length > 5000) throw requisicaoInvalida('Importe no máximo 5.000 linhas por vez.');
  return linhas.map(({ linha, campos }) => ({
    linha,
    get: (c: string) => campos[chaves.indexOf(chaveCabecalho(c))]?.trim() ?? '',
  }));
}

/** Converte uma linha do CSV em entrada da API. */
export function entradaDaLinhaCsv(get: (c: string) => string): EntradaTarifa {
  const cia = get('Companhia').toUpperCase();
  if (!(COMPANHIAS as readonly string[]).includes(cia)) {
    throw new ErroValidacao(
      'airline',
      `Companhia "${get('Companhia')}" inválida: use GOL, AZUL ou LATAM.`,
    );
  }
  return {
    origin: get('Origem'),
    destination: get('Destino'),
    airline: cia as Companhia,
    validFrom: get('Vigência Início'),
    validTo: get('Vigência Fim'),
    active: lerStatusCsv(get('Status')),
    levels: {
      URGENTE: { perKg: get('Urgente R$/Kg'), min: get('Urgente Min') },
      RAPIDO: { perKg: get('Rápido R$/Kg'), min: get('Rápido Min') },
      ECONOMICO: { perKg: get('Econômico R$/Kg'), min: get('Econômico Min') },
    },
    notes: get('Observações'),
  };
}
