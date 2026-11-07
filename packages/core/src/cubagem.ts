import type { Modal } from './ad-valorem.js';
import { ErroValidacao } from './erros.js';
import { D, type Dec, type DecimalInput } from './money.js';
import { arred2, numeroNaoNegativo, type Entrada } from './numeros.js';

/** Fatores de cubagem em kg/m³ (CLAUDE.md §3.2). */
export const FATOR_CUBAGEM: Readonly<Record<Modal, string>> = Object.freeze({
  AEREO: '166.667',
  RODOVIARIO: '300',
});

/**
 * Como somar o peso taxado total (CLAUDE.md §3.2):
 * - POR_VOLUME: Σ MAX(bruto, cubado) de cada linha.
 * - POR_EMBARQUE: MAX(Σ bruto, Σ cubado). É o que o app atual faz (confirmado em 07/11/2026).
 */
export type ModoTaxado = 'POR_VOLUME' | 'POR_EMBARQUE';

/** Padrão confirmado em 07/11/2026 com o app atual (CLAUDE.md §3.2). */
export const MODO_TAXADO_PADRAO: ModoTaxado = 'POR_EMBARQUE';

export interface VolumeEntrada {
  comprimentoM: Entrada;
  larguraM: Entrada;
  alturaM: Entrada;
  /** Peso bruto POR UNIDADE (kg). */
  pesoBrutoKg: Entrada;
  /** Quantidade de unidades iguais (inteiro ≥ 1). Vazio = 1. */
  quantidade?: Entrada;
}

export interface EntradaCubagem {
  modal: Modal;
  volumes: readonly VolumeEntrada[];
  modo?: ModoTaxado;
  /** Fatores configurados (opcional); padrão = FATOR_CUBAGEM. */
  fatores?: Readonly<Record<Modal, DecimalInput>>;
}

export interface VolumeResultado {
  indice: number;
  quantidade: number;
  /** m³ de UMA unidade (3 casas). */
  volumeM3Unitario: Dec;
  /** Totais da linha (unidade × quantidade), arredondados para 2 casas. */
  pesoBruto: Dec;
  pesoCubado: Dec;
  pesoTaxado: Dec;
}

export interface ResultadoCubagem {
  modal: Modal;
  modo: ModoTaxado;
  fator: Dec;
  volumes: VolumeResultado[];
  quantidadeTotal: number;
  volumeM3Total: Dec;
  pesoBrutoTotal: Dec;
  pesoCubadoTotal: Dec;
  /** Peso taxado total conforme o `modo`. */
  pesoTaxadoTotal: Dec;
}

function dimensao(valor: Entrada, campo: string, rotulo: string): Dec {
  return numeroNaoNegativo(valor, { campo, rotulo, permiteZero: false });
}

export function calcularCubagem(entrada: EntradaCubagem): ResultadoCubagem {
  const { modal } = entrada;
  const modo = entrada.modo ?? MODO_TAXADO_PADRAO;
  const fatores = entrada.fatores ?? FATOR_CUBAGEM;
  if (fatores[modal] === undefined) {
    throw new Error(`Modal desconhecido: ${String(modal)}`);
  }
  const fator = new D(fatores[modal]);

  if (entrada.volumes.length === 0) {
    throw new ErroValidacao('volumes', 'Adicione pelo menos um volume.');
  }

  let somaBruto = new D(0);
  let somaCubado = new D(0);
  let somaTaxadoLinhas = new D(0);
  let somaM3 = new D(0);
  let quantidadeTotal = 0;

  const volumes = entrada.volumes.map((v, i): VolumeResultado => {
    const n = i + 1;
    const p = `volumes.${i}`;
    const c = dimensao(v.comprimentoM, `${p}.comprimentoM`, `Volume ${n}: comprimento`);
    const l = dimensao(v.larguraM, `${p}.larguraM`, `Volume ${n}: largura`);
    const a = dimensao(v.alturaM, `${p}.alturaM`, `Volume ${n}: altura`);
    const bruto = numeroNaoNegativo(v.pesoBrutoKg, {
      campo: `${p}.pesoBrutoKg`,
      rotulo: `Volume ${n}: peso bruto`,
      padrao: 0,
    });
    const qtd = numeroNaoNegativo(v.quantidade, {
      campo: `${p}.quantidade`,
      rotulo: `Volume ${n}: quantidade`,
      padrao: 1,
      permiteZero: false,
      casas: 0,
    });

    const m3 = c.times(l).times(a);
    const cubadoUnit = m3.times(fator);
    const taxadoUnit = D.max(bruto, cubadoUnit);

    const linhaBruto = bruto.times(qtd);
    const linhaCubado = cubadoUnit.times(qtd);
    const linhaTaxado = taxadoUnit.times(qtd);

    somaBruto = somaBruto.plus(linhaBruto);
    somaCubado = somaCubado.plus(linhaCubado);
    somaTaxadoLinhas = somaTaxadoLinhas.plus(linhaTaxado);
    somaM3 = somaM3.plus(m3.times(qtd));
    quantidadeTotal += qtd.toNumber();

    return {
      indice: n,
      quantidade: qtd.toNumber(),
      volumeM3Unitario: m3.toDecimalPlaces(3, D.ROUND_HALF_UP),
      pesoBruto: arred2(linhaBruto),
      pesoCubado: arred2(linhaCubado),
      pesoTaxado: arred2(linhaTaxado),
    };
  });

  const taxadoTotal = modo === 'POR_EMBARQUE' ? D.max(somaBruto, somaCubado) : somaTaxadoLinhas;

  return {
    modal,
    modo,
    fator,
    volumes,
    quantidadeTotal,
    volumeM3Total: somaM3.toDecimalPlaces(3, D.ROUND_HALF_UP),
    pesoBrutoTotal: arred2(somaBruto),
    pesoCubadoTotal: arred2(somaCubado),
    pesoTaxadoTotal: arred2(taxadoTotal),
  };
}
