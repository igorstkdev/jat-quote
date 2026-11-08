import { formatBRL, formatNumero, formatPercentual } from '@jat/core';
import type { Localidade, TabelaFtl, VeiculoFtl } from '@/lib/api';

export const VEICULOS: VeiculoFtl[] = ['UTILITARIO', 'VAN', 'TRES_QUARTOS'];
export const ROTULO_VEICULO: Record<VeiculoFtl, string> = {
  UTILITARIO: 'Utilitário',
  VAN: 'VAN',
  TRES_QUARTOS: '1.5T',
};
export const ROTULO_LOCALIDADE: Record<Localidade, string> = {
  CAPITAL: 'Capital',
  INTERIOR: 'Interior',
};

/** Regiões do IBGE: sugestão ao cadastrar a tabela (o campo continua editável). */
export const REGIAO_UF: Record<string, string> = {
  AC: 'Norte',
  AM: 'Norte',
  AP: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
};

export const kmBR = (v: string) => `R$ ${formatNumero(v, 2, 4)}`;

export const QUALP_URL = 'https://qualp.com.br/#/';

export const COLUNAS_CSV_FTL =
  'UF; Região; Tipo; Utilitário R$/Km; VAN R$/Km; 1.5T R$/Km; Ad Valorem %; Status; Versão; Observações';

export function camposTabela(s: Omit<TabelaFtl, 'id' | 'createdAt' | 'updatedAt'>) {
  return [
    ['Tabela', `${s.uf} ${ROTULO_LOCALIDADE[s.locality]}`],
    ['Região', s.region],
    ['Utilitário', `${kmBR(s.perKm.UTILITARIO)}/km`],
    ['VAN', `${kmBR(s.perKm.VAN)}/km`],
    ['1.5T', `${kmBR(s.perKm.TRES_QUARTOS)}/km`],
    ['Ad valorem', formatPercentual(s.adValoremPct)],
    ['Status', s.active ? 'Ativa' : 'Inativa'],
    ['Observações', s.notes || '—'],
  ] as [string, string][];
}

export const brl = formatBRL;
