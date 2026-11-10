import { D, type Dec } from './money.js';

/**
 * Taxa de conversão (CLAUDE.md §3.7): Aprovadas ÷ (Aprovadas + Declinadas), em %.
 * Recusadas e Pendentes não entram. Sem aprovadas nem declinadas → null (não há o que medir).
 * Valor sem arredondar: quem exibe arredonda.
 */
export function taxaConversao(aprovadas: number, declinadas: number): Dec | null {
  const base = aprovadas + declinadas;
  if (base === 0) return null;
  return D(aprovadas).div(base).times(100);
}

/** Mês "aaaa-mm" de uma data ISO (aaaa-mm-dd). */
export function mesDe(dataIso: string): string {
  return dataIso.slice(0, 7);
}

/** Lista de meses "aaaa-mm" de `inicio` até `fim` (inclusive). */
export function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let [a, m] = inicio.split('-').map(Number) as [number, number];
  const [af, mf] = fim.split('-').map(Number) as [number, number];
  while (a < af || (a === af && m <= mf)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

const NOMES_MES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** "2026-11" → "nov/26". */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-');
  return `${NOMES_MES[Number(m) - 1]}/${a!.slice(2)}`;
}
