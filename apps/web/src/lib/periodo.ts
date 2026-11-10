import { hojeIso } from '@jat/core';

/** Atalhos de período usados no Relatório e no Dashboard. */
export const PERIODOS = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes-passado', rotulo: 'Mês passado' },
  { valor: '3m', rotulo: 'Últimos 3 meses' },
  { valor: '12m', rotulo: 'Últimos 12 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Todo o período' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
] as const;

export type Periodo = (typeof PERIODOS)[number]['valor'];

export const ehPeriodo = (v: string | null): v is Periodo => PERIODOS.some((p) => p.valor === v);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const inicioMes = (a: number, m: number) => iso(new Date(Date.UTC(a, m - 1, 1, 12)));
const fimMes = (a: number, m: number) => iso(new Date(Date.UTC(a, m, 0, 12)));

/**
 * Intervalo (aaaa-mm-dd, inclusive) de um atalho, no dia de hoje em São Paulo.
 * "tudo" e "personalizado" devolvem vazio (quem chama usa as datas digitadas).
 */
export function intervalo(p: Periodo, hoje = hojeIso()): { from: string; to: string } {
  const [a, m] = hoje.split('-').map(Number) as [number, number];
  switch (p) {
    case 'hoje':
      return { from: hoje, to: hoje };
    case '7d':
      return { from: somarDias(hoje, -6), to: hoje };
    case 'mes':
      return { from: inicioMes(a, m), to: hoje };
    case 'mes-passado':
      return m === 1
        ? { from: inicioMes(a - 1, 12), to: fimMes(a - 1, 12) }
        : { from: inicioMes(a, m - 1), to: fimMes(a, m - 1) };
    case '3m':
      return { from: inicioMes(m <= 2 ? a - 1 : a, ((m + 9) % 12) + 1), to: hoje };
    case '12m':
      return { from: inicioMes(m === 12 ? a : a - 1, (m % 12) + 1), to: hoje };
    case 'ano':
      return { from: inicioMes(a, 1), to: hoje };
    default:
      return { from: '', to: '' };
  }
}
