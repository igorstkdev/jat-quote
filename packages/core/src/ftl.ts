import { calcularAdValorem, type AdValoremInformativo } from './ad-valorem.js';
import { D, roundMoney, type Dec, type DecimalInput } from './money.js';
import { numeroNaoNegativo, type Entrada } from './numeros.js';

export type VeiculoFtl = 'UTILITARIO' | 'VAN' | 'TRES_QUARTOS';
export const VEICULOS_FTL: readonly VeiculoFtl[] = Object.freeze([
  'UTILITARIO',
  'VAN',
  'TRES_QUARTOS',
]);
export const ROTULO_VEICULO: Readonly<Record<VeiculoFtl, string>> = Object.freeze({
  UTILITARIO: 'Utilitário',
  VAN: 'VAN',
  TRES_QUARTOS: '1.5T',
});

export type TipoLocalidade = 'CAPITAL' | 'INTERIOR';

/** Linha da tabela FTL Fiat (CLAUDE.md §3.4). */
export interface TarifaFtl {
  id?: string;
  uf: string;
  regiao: string;
  localidade: TipoLocalidade;
  tarifaKm: Readonly<Record<VeiculoFtl, DecimalInput>>;
  adValoremPct: DecimalInput;
}

export interface EntradaFtl {
  tarifa: TarifaFtl;
  veiculo: VeiculoFtl;
  distanciaKm: Entrada;
  valorMercadoria?: Entrada;
}

export interface ResultadoFtl {
  veiculo: VeiculoFtl;
  distanciaKm: Dec;
  tarifaKm: Dec;
  /** `Frete = Distância (km) × Tarifa/km do veículo`. Valor oficial. */
  total: Dec;
  /** Informativo: NUNCA entra no total. */
  adValorem: AdValoremInformativo;
}

/**
 * Frete FTL Fiat (CLAUDE.md §3.4).
 * ⚠️ Pedágio e markup no FTL ainda não confirmados: não implementados.
 */
export function calcularFtl(entrada: EntradaFtl): ResultadoFtl {
  const { tarifa, veiculo } = entrada;
  const tarifaKmBruta = tarifa.tarifaKm[veiculo];
  if (tarifaKmBruta === undefined) {
    throw new Error(`Veículo desconhecido: ${String(veiculo)}`);
  }
  const distanciaKm = numeroNaoNegativo(entrada.distanciaKm, {
    campo: 'distanciaKm',
    rotulo: 'Distância (km)',
    permiteZero: false,
  });
  const tarifaKm = numeroNaoNegativo(tarifaKmBruta, {
    campo: 'tarifaKm',
    rotulo: `Tarifa/km (${ROTULO_VEICULO[veiculo]})`,
  });
  const pct = numeroNaoNegativo(tarifa.adValoremPct, {
    campo: 'adValoremPct',
    rotulo: 'Ad valorem (%)',
    maximo: 100,
  });

  return {
    veiculo,
    distanciaKm,
    tarifaKm,
    total: roundMoney(distanciaKm.times(tarifaKm)),
    adValorem: calcularAdValorem(new D(pct), entrada.valorMercadoria),
  };
}
