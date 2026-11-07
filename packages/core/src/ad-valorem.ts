import { D, roundMoney, type Dec, type DecimalInput } from './money.js';
import { formatPercentual, numeroNaoNegativo, parseNumero, type Entrada } from './numeros.js';

export type Modal = 'AEREO' | 'RODOVIARIO';

/**
 * Padrões de ad valorem por modal (CLAUDE.md §3.1). Configuráveis pelo Admin:
 * a API passa os valores do banco em `padroes`; estes são os valores de fábrica.
 */
export const AD_VALOREM_PADRAO: Readonly<Record<Modal, string>> = Object.freeze({
  AEREO: '0.47',
  RODOVIARIO: '0.15',
});

/**
 * Resolve o percentual de ad valorem da cotação.
 * Campo em branco usa o padrão do modal.
 */
export function resolverAdValoremPct(
  modal: Modal,
  informado?: Entrada,
  padroes: Readonly<Record<Modal, DecimalInput>> = AD_VALOREM_PADRAO,
): Dec {
  return numeroNaoNegativo(informado, {
    campo: 'adValoremPct',
    rotulo: 'Ad valorem (%)',
    padrao: padroes[modal],
    maximo: 100,
  });
}

export interface AdValoremInformativo {
  /** Percentual aplicado (ex.: 0.15 = 0,15%). */
  pct: Dec;
  /** Valor estimado da mercadoria, se informado. */
  valorMercadoria: Dec | null;
  /** Estimativa do ad valorem em R$ (arredondada). INFORMATIVA: nunca entra no total. */
  estimativa: Dec | null;
  /** Texto da condição comercial para o PDF e o "Copiar". */
  condicao: string;
}

/**
 * Ad valorem é APENAS INFORMATIVO (CLAUDE.md §3.1): não entra em nenhuma soma.
 */
export function calcularAdValorem(pct: Dec, valorMercadoria?: Entrada): AdValoremInformativo {
  const vazio = parseNumero(valorMercadoria, 'valorMercadoria', 'Valor da mercadoria') === null;
  const mercadoria = vazio
    ? null
    : numeroNaoNegativo(valorMercadoria, {
        campo: 'valorMercadoria',
        rotulo: 'Valor da mercadoria',
        casas: 2,
      });
  return {
    pct,
    valorMercadoria: mercadoria,
    estimativa: mercadoria === null ? null : roundMoney(mercadoria.times(pct).div(100)),
    condicao: textoCondicaoAdValorem(pct),
  };
}

/** "Ad valorem de 0,15% sobre o valor da nota fiscal, cobrado adicionalmente." */
export function textoCondicaoAdValorem(pct: DecimalInput): string {
  return `Ad valorem de ${formatPercentual(new D(pct))} sobre o valor da nota fiscal, cobrado adicionalmente.`;
}
