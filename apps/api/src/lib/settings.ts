import { AD_VALOREM_PADRAO } from '@jat/core';
import type { Db } from '../db.js';

/** Chaves das configurações do sistema (tabela settings). */
export const CHAVES = {
  adValorem: 'ad_valorem_padrao',
  condicoesFtl: 'condicoes_comerciais_ftl',
  linksRastreio: 'links_rastreio',
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

export async function lerCondicoesFtl(db: Db): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: CHAVES.condicoesFtl } });
  return typeof s?.value === 'string' ? s.value : CONDICOES_FTL_PADRAO;
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
