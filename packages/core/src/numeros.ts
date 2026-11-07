import { ErroValidacao } from './erros.js';
import { D, type Dec, type DecimalInput } from './money.js';

/** Valor numérico de entrada: aceita vazio (null, undefined ou ""). */
export type Entrada = DecimalInput | null | undefined;

/**
 * Converte texto digitado no padrão brasileiro para Decimal.
 *
 * Regras:
 * - Com vírgula: a vírgula é o separador decimal e os pontos são de milhar ("1.234,56").
 * - Sem vírgula e com mais de um ponto: os pontos são de milhar ("1.234.567").
 * - Sem vírgula e com um ponto: o ponto é decimal ("0.4", "1234.56").
 * - Vazio (ou só espaços) devolve null.
 */
export function parseNumero(valor: Entrada, campo = 'valor', rotulo = 'Valor'): Dec | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') {
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      throw new ErroValidacao(campo, `${rotulo} inválido.`);
    }
    return new D(valor);
  }

  let texto = valor.trim().replace(/\s/g, '');
  if (texto === '') return null;

  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if ((texto.match(/\./g) ?? []).length > 1) {
    texto = texto.replace(/\./g, '');
  }

  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(texto)) {
    throw new ErroValidacao(campo, `${rotulo} inválido: use apenas números (ex.: 1.234,56).`);
  }
  return new D(texto);
}

interface OpcoesNumero {
  campo: string;
  rotulo: string;
  /** Valor quando o campo está vazio. Se omitido, o campo é obrigatório. */
  padrao?: DecimalInput;
  /** Permite zero (padrão: true). */
  permiteZero?: boolean;
  /** Valor máximo permitido (inclusivo). */
  maximo?: DecimalInput;
  /** Número máximo de casas decimais. */
  casas?: number;
  /** Mensagem para valor negativo. */
  msgNegativo?: string;
}

/** Lê um número não negativo com validação e mensagens em português. */
export function numeroNaoNegativo(valor: Entrada, opcoes: OpcoesNumero): Dec {
  const { campo, rotulo } = opcoes;
  const n = parseNumero(valor, campo, rotulo);
  if (n === null) {
    if (opcoes.padrao === undefined) {
      throw new ErroValidacao(campo, `${rotulo} é obrigatório.`);
    }
    return new D(opcoes.padrao);
  }
  if (n.isNegative() && !n.isZero()) {
    throw new ErroValidacao(campo, opcoes.msgNegativo ?? `${rotulo} não pode ser negativo.`);
  }
  if (opcoes.permiteZero === false && n.isZero()) {
    throw new ErroValidacao(campo, `${rotulo} deve ser maior que zero.`);
  }
  if (opcoes.maximo !== undefined && n.greaterThan(opcoes.maximo)) {
    throw new ErroValidacao(campo, `${rotulo} não pode ser maior que ${String(opcoes.maximo)}.`);
  }
  if (opcoes.casas !== undefined && n.decimalPlaces() > opcoes.casas) {
    throw new ErroValidacao(campo, `${rotulo}: use no máximo ${opcoes.casas} casas decimais.`);
  }
  return n.abs(); // normaliza "-0" para 0
}

/** Arredonda para 2 casas (meio para cima). Usado para pesos e valores exibidos. */
export function arred2(valor: Dec): Dec {
  return valor.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Formata número no padrão brasileiro: `1.234,56`. Arredonda meio para cima. */
export function formatNumero(valor: DecimalInput, minCasas = 2, maxCasas = minCasas): string {
  let n = new D(valor).toDecimalPlaces(maxCasas, D.ROUND_HALF_UP);
  if (n.isZero()) n = new D(0);
  const negativo = n.isNegative();
  let [inteiro = '0', fracao = ''] = n.abs().toFixed(maxCasas).split('.');
  while (fracao.length > minCasas && fracao.endsWith('0')) fracao = fracao.slice(0, -1);
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${inteiro}${fracao ? `,${fracao}` : ''}`;
}

/** Formata peso: `1.234,56 kg`. */
export function formatPeso(valor: DecimalInput): string {
  return `${formatNumero(valor)} kg`;
}

/** Formata percentual: `0,15%` (2 a 4 casas). */
export function formatPercentual(valor: DecimalInput): string {
  return `${formatNumero(valor, 2, 4)}%`;
}
