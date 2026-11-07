import { Decimal } from 'decimal.js';

/**
 * Instância de Decimal usada em todo o JAT Quote.
 *
 * Regra (CLAUDE.md §4): nunca usar float para dinheiro. Os cálculos são feitos
 * sem arredondar e só o resultado final é arredondado, com arredondamento
 * comercial (meio para cima, ROUND_HALF_UP), o mesmo usado pelo Excel.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

export type DecimalInput = Decimal | string | number;

/** Converte entrada (string "1234.56", número ou Decimal) para Decimal. */
export function dec(value: DecimalInput): Dec {
  return new D(value);
}

/** Arredonda um valor monetário para centavos (2 casas), meio para cima. */
export function roundMoney(value: DecimalInput): Dec {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Formata em BRL: `R$ 1.234,56` (negativo: `-R$ 1.234,56`).
 * Arredonda (meio para cima) antes de formatar. Não passa por float.
 */
export function formatBRL(value: DecimalInput): string {
  const rounded = roundMoney(value);
  const negative = rounded.isNegative() && !rounded.isZero();
  const [int = '0', cents = '00'] = rounded.abs().toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${grouped},${cents}`;
}
