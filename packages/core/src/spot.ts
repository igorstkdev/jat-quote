import {
  calcularAdValorem,
  resolverAdValoremPct,
  type AdValoremInformativo,
  type Modal,
} from './ad-valorem.js';
import { D, roundMoney, type Dec, type DecimalInput } from './money.js';
import { numeroNaoNegativo, type Entrada } from './numeros.js';

export type ComponenteSpot = 'RODOVIARIO' | 'COLETA' | 'AEREO' | 'ENTREGA';

export const ROTULO_COMPONENTE: Readonly<Record<ComponenteSpot, string>> = Object.freeze({
  RODOVIARIO: 'Custo Rodoviário',
  COLETA: 'Custo de Coleta',
  AEREO: 'Custo Aéreo',
  ENTREGA: 'Custo de Entrega',
});

/** Componentes de custo de cada modal (CLAUDE.md §3.1), na ordem de exibição. */
export const COMPONENTES_POR_MODAL: Readonly<Record<Modal, readonly ComponenteSpot[]>> =
  Object.freeze({
    RODOVIARIO: ['RODOVIARIO'],
    AEREO: ['COLETA', 'AEREO', 'ENTREGA'],
  });

export interface EntradaSpot {
  modal: Modal;
  /** Custos por componente. Componentes de outro modal são ignorados. Vazio = 0. */
  custos: Partial<Record<ComponenteSpot, Entrada>>;
  pedagio?: Entrada;
  markupPct?: Entrada;
  /** Vazio = padrão do modal. */
  adValoremPct?: Entrada;
  valorMercadoria?: Entrada;
  /** Padrões de ad valorem configurados pelo Admin (opcional). */
  padroesAdValorem?: Readonly<Record<Modal, DecimalInput>>;
}

export interface LinhaComponente {
  componente: ComponenteSpot;
  rotulo: string;
  custo: Dec;
  /** Custo × (1 + markup), arredondado para exibição. */
  comMarkup: Dec;
}

export interface ResultadoSpot {
  modal: Modal;
  markupPct: Dec;
  componentes: LinhaComponente[];
  /** Soma dos custos (sem markup). */
  somaCustos: Dec;
  /** "MKUP Total Aplicado" = Subtotal − SomaDosCustos. */
  markupTotal: Dec;
  /** "Subtotal com MKUP" = SomaDosCustos × (1 + Markup%/100). */
  subtotal: Dec;
  pedagio: Dec;
  /** "Total Final" = Subtotal + Pedágio. Valor oficial da cotação. */
  total: Dec;
  /** Informativo: NUNCA entra no total. */
  adValorem: AdValoremInformativo;
}

function dinheiro(valor: Entrada, campo: string, rotulo: string): Dec {
  return numeroNaoNegativo(valor, { campo, rotulo, padrao: 0, casas: 2 });
}

/**
 * Calcula o frete Spot (CLAUDE.md §3.1).
 *
 * Os cálculos são feitos sem arredondar; cada valor do resultado é arredondado
 * só no fim (meio para cima). O `total` é o valor oficial da cotação.
 */
export function calcularSpot(entrada: EntradaSpot): ResultadoSpot {
  const { modal } = entrada;
  const componentesModal = COMPONENTES_POR_MODAL[modal];
  if (!componentesModal) {
    throw new Error(`Modal desconhecido: ${String(modal)}`);
  }

  const markupPct = numeroNaoNegativo(entrada.markupPct, {
    campo: 'markupPct',
    rotulo: 'Markup (%)',
    padrao: 0,
    msgNegativo: 'O markup não pode ser negativo.',
  });
  const fator = new D(1).plus(markupPct.div(100));

  const custos = componentesModal.map((componente) => ({
    componente,
    rotulo: ROTULO_COMPONENTE[componente],
    custo: dinheiro(
      entrada.custos[componente],
      `custos.${componente}`,
      ROTULO_COMPONENTE[componente],
    ),
  }));

  const somaCustos = custos.reduce((acc, c) => acc.plus(c.custo), new D(0));
  const subtotal = somaCustos.times(fator);
  const pedagio = dinheiro(entrada.pedagio, 'pedagio', 'Pedágio');
  const total = subtotal.plus(pedagio);

  const pct = resolverAdValoremPct(modal, entrada.adValoremPct, entrada.padroesAdValorem);

  return {
    modal,
    markupPct,
    componentes: custos.map((c) => ({ ...c, comMarkup: roundMoney(c.custo.times(fator)) })),
    somaCustos: roundMoney(somaCustos),
    markupTotal: roundMoney(subtotal.minus(somaCustos)),
    subtotal: roundMoney(subtotal),
    pedagio: roundMoney(pedagio),
    total: roundMoney(total),
    adValorem: calcularAdValorem(pct, entrada.valorMercadoria),
  };
}
