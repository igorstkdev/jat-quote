import { formatBRL, formatNumero } from '@jat/core';
import type { Companhia, Nivel, TarifaAerea } from '@/lib/api';
import { cn } from '@/lib/utils';

export const COMPANHIAS: Companhia[] = ['GOL', 'AZUL', 'LATAM'];
export const NIVEIS: Nivel[] = ['URGENTE', 'RAPIDO', 'ECONOMICO'];
export const ROTULO_NIVEL: Record<Nivel, string> = {
  URGENTE: 'Urgente',
  RAPIDO: 'Rápido',
  ECONOMICO: 'Econômico',
};

const COR_CIA: Record<Companhia, string> = {
  GOL: 'bg-cia-gol',
  AZUL: 'bg-cia-azul',
  LATAM: 'bg-cia-latam',
};

export function CiaBadge({ cia, className }: { cia: Companhia; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', className)}>
      <span className={cn('size-2 rounded-full', COR_CIA[cia])} aria-hidden />
      {cia}
    </span>
  );
}

export const corCia = (c: Companhia) => COR_CIA[c];

/** R$/kg com 2 a 4 casas (tarifas podem ter 4). */
export const tarifaKg = (v: string) => `R$ ${formatNumero(v, 2, 4)}`;

/** aaaa-mm-dd → dd/mm/aaaa */
export const dataBR = (iso: string) => iso.split('-').reverse().join('/');

export const vigencia = (t: Pick<TarifaAerea, 'validFrom' | 'validTo'>) =>
  t.validTo ? `${dataBR(t.validFrom)} a ${dataBR(t.validTo)}` : `desde ${dataBR(t.validFrom)}`;

/** Campos da versão para o histórico. */
export function camposTarifa(s: Omit<TarifaAerea, 'id' | 'current' | 'createdAt' | 'updatedAt'>) {
  const nivel = (n: Nivel): [string, string] => {
    const l = s.levels[n];
    return [ROTULO_NIVEL[n], l ? `${tarifaKg(l.perKg)}/kg · mín. ${formatBRL(l.min)}` : '—'];
  };
  return [
    ['Rota', `${s.origin} → ${s.destination}`],
    ['Companhia', s.airline],
    ['Vigência', vigencia(s)],
    nivel('URGENTE'),
    nivel('RAPIDO'),
    nivel('ECONOMICO'),
    ['Status', s.active ? 'Ativa' : 'Inativa'],
    ['Observações', s.notes || '—'],
  ] as [string, string][];
}
