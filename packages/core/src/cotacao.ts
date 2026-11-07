import type { Modal } from './ad-valorem.js';
import { formatBRL, type DecimalInput } from './money.js';
import { formatPercentual } from './numeros.js';

/** Validade padrão das cotações (confirmada em 07/11/2026). */
export const VALIDADE_COTACAO_DIAS = 30;

export const ROTULO_MODAL: Readonly<Record<Modal | 'FTL', string>> = Object.freeze({
  AEREO: 'Aéreo',
  RODOVIARIO: 'Rodoviário',
  FTL: 'FTL Fiat',
});

/** JQ-000123 */
export function formatarNumeroCotacao(numero: number): string {
  return `JQ-${String(numero).padStart(6, '0')}`;
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** dd/mm/aaaa no fuso de São Paulo. */
export function formatarDataBR(data: Date): string {
  return fmtData.format(data);
}

/** Data final da validade (data da cotação + N dias). */
export function dataValidade(data: Date, dias = VALIDADE_COTACAO_DIAS): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

export interface DadosTextoCotacao {
  numero?: number | null;
  cliente: string;
  origem: string;
  destino: string;
  modal: Modal | 'FTL';
  data: Date;
  total: DecimalInput;
  adValoremPct: DecimalInput;
  observacoes?: string | null;
  validadeDias?: number;
}

/**
 * Texto da cotação para o CLIENTE (sem custos internos), usado no "Copiar" e no e-mail.
 * Com `whatsapp: true`, destaca com *negrito* do WhatsApp.
 */
export function textoCotacao(d: DadosTextoCotacao, opcoes: { whatsapp?: boolean } = {}): string {
  const b = (s: string) => (opcoes.whatsapp ? `*${s}*` : s);
  const dias = d.validadeDias ?? VALIDADE_COTACAO_DIAS;
  const titulo = d.numero
    ? `COTAÇÃO DE FRETE ${formatarNumeroCotacao(d.numero)}`
    : 'COTAÇÃO DE FRETE';
  const linhas = [
    b(titulo),
    'JAT Transportes e Logística',
    '',
    `Cliente: ${d.cliente}`,
    `Origem: ${d.origem}`,
    `Destino: ${d.destino}`,
    `Modal: ${ROTULO_MODAL[d.modal]}`,
    `Data: ${formatarDataBR(d.data)}`,
    '',
    b(`Valor do frete: ${formatBRL(d.total)}`),
    '',
    'Condições:',
    `• Ad valorem de ${formatPercentual(d.adValoremPct)} sobre o valor da nota fiscal, cobrado adicionalmente.`,
    `• Validade: ${dias} dias (até ${formatarDataBR(dataValidade(d.data, dias))}).`,
  ];
  const obs = d.observacoes?.trim();
  if (obs) linhas.push('', `Observações: ${obs}`);
  return linhas.join('\n');
}

/** Assunto do e-mail: "Cotação de frete JQ-000123 — São Paulo, SP → Feira de Santana, BA" */
export function assuntoCotacao(
  d: Pick<DadosTextoCotacao, 'numero' | 'origem' | 'destino'>,
): string {
  const n = d.numero ? ` ${formatarNumeroCotacao(d.numero)}` : '';
  return `Cotação de frete${n} — ${d.origem} → ${d.destino}`;
}

/** Link mailto: com assunto e corpo preenchidos. */
export function linkEmailCotacao(d: DadosTextoCotacao, para?: string | null): string {
  const q = `subject=${encodeURIComponent(assuntoCotacao(d))}&body=${encodeURIComponent(textoCotacao(d))}`;
  return `mailto:${para ? encodeURIComponent(para) : ''}?${q}`;
}
