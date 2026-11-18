import {
  AD_VALOREM_PADRAO,
  condicoesVazias,
  lerCondicoes,
  TOPICOS_AEREO_PADRAO,
  type Condicoes,
} from '@jat/core';
import type { Db } from '../db.js';

/** Chaves das configurações do sistema (tabela settings). */
export const CHAVES = {
  adValorem: 'ad_valorem_padrao',
  condicoesFtl: 'condicoes_comerciais_ftl',
  linksRastreio: 'links_rastreio',
  /** Condições Spot por modal (17/11/2026). */
  condicoesSpot: 'condicoes_spot',
  /** Condições FTL por veículo (17/11/2026). Substitui condicoes_comerciais_ftl. */
  condicoesFtlVeiculos: 'condicoes_ftl_veiculos',
} as const;

export interface AdValoremPadrao {
  AEREO: string;
  RODOVIARIO: string;
}

/** Texto do app atual (referência), editável pelo Admin. */
export const CONDICOES_FTL_PADRAO =
  'O ATENDIMENTO SOMENTE PODERÁ SER ACIONADO QUANDO A CARGA E NF ESTIVEREM TOTALMENTE LIBERADA. ' +
  'SENÃO SOFRERÁ O CUSTO DA COTAÇÃO. O TRANSPORTE DEVERÁ SER ACIONADO COM ANTECEDÊNCIA. ' +
  'PRAZO DE PAGAMENTO 30 DIAS, VALOR DA COTAÇÃO CONSTA PIS/COFINS. DEPOIS DE SOLICITADO NÃO MAIS ' +
  'PODERÁ SER CANCELADO SEM QUE HAJA PAGAMENTO DO CUSTO DE DESLOCAMENTO (equivalente a 40% sob o ' +
  'valor da cotação). VEÍCULO COTADO, VAN, DIÁRIA R$ 496,71 FREE TIME DE 3 HORAS NA COLETA E 3 ' +
  'HORAS NA ENTREGA. IMPOSTOS E SEGURO A INCLUIR, PRAZO DE VALIDADE 15 DIAS. ATENDIMENTO SUJEITO ' +
  'A DISPONIBILIDADE DE VEÍCULO QUANDO FOR ACIONADO A COLETA, TAMBÉM SUJEITO A RESTRIÇÕES DE ' +
  'VEÍCULOS DEVIDO A LEIS E DECRETOS DE QUARENTENA, JAT TRANSPORTES E LOGÍSTICA S/A.';

export async function lerAdValoremPadrao(db: Db): Promise<AdValoremPadrao> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.adValorem } });
  const v = (s?.value ?? {}) as Partial<AdValoremPadrao>;
  return {
    AEREO: v.AEREO ?? AD_VALOREM_PADRAO.AEREO,
    RODOVIARIO: v.RODOVIARIO ?? AD_VALOREM_PADRAO.RODOVIARIO,
  };
}

/** Texto único antigo das condições FTL (antes de 17/11/2026): ponto de partida dos 3 veículos. */
async function lerCondicoesFtlAntigas(db: Db): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.condicoesFtl } });
  return typeof s?.value === 'string' ? s.value : CONDICOES_FTL_PADRAO;
}

export const MODAIS_SPOT = ['RODOVIARIO', 'AEREO'] as const;
export type ModalSpot = (typeof MODAIS_SPOT)[number];
export const VEICULOS_CONDICOES = ['UTILITARIO', 'VAN', 'TRES_QUARTOS'] as const;
export type VeiculoCondicoes = (typeof VEICULOS_CONDICOES)[number];

export type CondicoesSpot = Record<ModalSpot, Condicoes>;
export type CondicoesFtl = Record<VeiculoCondicoes, Condicoes>;

/** Padrões: Aéreo com os tópicos de referência; Rodoviário vazio (texto ainda não informado). */
export const CONDICOES_SPOT_PADRAO: CondicoesSpot = {
  RODOVIARIO: condicoesVazias('TOPICOS'),
  AEREO: { formato: 'TOPICOS', topicos: [...TOPICOS_AEREO_PADRAO], texto: '' },
};

export async function lerCondicoesSpot(db: Db): Promise<CondicoesSpot> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.condicoesSpot } });
  const v = (s?.value ?? null) as Partial<Record<ModalSpot, unknown>> | null;
  return {
    RODOVIARIO: v?.RODOVIARIO ? lerCondicoes(v.RODOVIARIO) : CONDICOES_SPOT_PADRAO.RODOVIARIO,
    AEREO: v?.AEREO ? lerCondicoes(v.AEREO) : CONDICOES_SPOT_PADRAO.AEREO,
  };
}

/** Condições FTL por veículo. Sem configuração ainda: os 3 começam com o texto antigo (texto livre). */
export async function lerCondicoesFtl(db: Db): Promise<CondicoesFtl> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.condicoesFtlVeiculos } });
  const v = (s?.value ?? null) as Partial<Record<VeiculoCondicoes, unknown>> | null;
  const antigo: Condicoes = {
    formato: 'TEXTO',
    topicos: [],
    texto: await lerCondicoesFtlAntigas(db),
  };
  return {
    UTILITARIO: v?.UTILITARIO ? lerCondicoes(v.UTILITARIO) : antigo,
    VAN: v?.VAN ? lerCondicoes(v.VAN) : antigo,
    TRES_QUARTOS: v?.TRES_QUARTOS ? lerCondicoes(v.TRES_QUARTOS) : antigo,
  };
}

export interface LinkRastreio {
  name: string;
  url: string;
}

/** Links de rastreio da tela de Tarifas Aéreas (informados em 08/11/2026), editáveis pelo Admin. */
export const LINKS_RASTREIO_PADRAO: readonly LinkRastreio[] = Object.freeze([
  { name: 'Rastreio Gollog', url: 'https://servicos.gollog.com.br/app/site/tracking' },
  { name: 'Rastreio Azul Cargo', url: 'https://www.azullogistica.com.br/Rastreio' },
]);

export async function lerLinksRastreio(db: Db): Promise<LinkRastreio[]> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.linksRastreio } });
  return Array.isArray(s?.value)
    ? (s.value as unknown as LinkRastreio[])
    : [...LINKS_RASTREIO_PADRAO];
}
