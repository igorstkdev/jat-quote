import { hojeIso, type DataIso } from './datas.js';

/**
 * Plano de vigência (licença) do JAT Quote — decisão de 14/11/2026.
 * O Admin ativa com a senha mestre de ativação escolhendo um plano. O prazo conta em meses de
 * calendário e o sistema vale até o FIM do dia do vencimento (fuso de São Paulo).
 * Renovar antes de vencer SOMA ao tempo que falta.
 * Vitalício (17/11/2026): sem vencimento e sem aviso.
 */
export const PLANOS_LICENCA = ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'VITALICIO'] as const;
export type PlanoLicenca = (typeof PLANOS_LICENCA)[number];

/** Meses de cada plano. Vitalício = null (não vence). */
export const MESES_PLANO: Readonly<Record<PlanoLicenca, number | null>> = Object.freeze({
  MENSAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
  VITALICIO: null,
});

/** "Data" de vencimento gravada no plano Vitalício (não é mostrada). */
export const VENCIMENTO_VITALICIO = '9999-12-31';

export const ROTULO_PLANO: Readonly<Record<PlanoLicenca, string>> = Object.freeze({
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  VITALICIO: 'Vitalício',
});

/** Os Admins são avisados quando faltam até 15 dias para vencer. */
export const AVISO_VENCIMENTO_DIAS = 15;

const partes = (d: DataIso) => d.slice(0, 10).split('-').map(Number) as [number, number, number];
const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Soma meses de calendário. Dia inexistente no mês final vira o último dia (31/01 + 1 = 28/02). */
export function somarMeses(dia: DataIso, meses: number): DataIso {
  const [a, m, d] = partes(dia);
  const total = a * 12 + (m - 1) + meses;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return iso(na, nm, Math.min(d, ultimo));
}

/** Dias corridos de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: DataIso, ate: DataIso): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Novo vencimento ao ativar/renovar. Se o vencimento atual ainda vale (hoje ou depois),
 * o plano é somado a ele; senão conta a partir de hoje.
 */
export function calcularVencimento(
  plano: PlanoLicenca,
  hoje: DataIso,
  vencimentoAtual: DataIso | null = null,
): DataIso {
  const meses = MESES_PLANO[plano];
  if (meses === null) return VENCIMENTO_VITALICIO;
  const base =
    vencimentoAtual && vencimentoAtual !== VENCIMENTO_VITALICIO && vencimentoAtual >= hoje
      ? vencimentoAtual
      : hoje;
  return somarMeses(base, meses);
}

export type SituacaoLicenca = 'NAO_ATIVADA' | 'ATIVA' | 'VENCIDA';

export interface EstadoVigencia {
  situacao: SituacaoLicenca;
  /** Dias até o vencimento (0 = vence hoje). null se não ativada ou vitalícia. */
  diasRestantes: number | null;
  /** Faltam até 15 dias (e ainda está ativa). */
  aviso: boolean;
}

/** Situação da vigência no dia informado (padrão: hoje em São Paulo). */
export function situacaoVigencia(
  vencimento: DataIso | null,
  agora: Date = new Date(),
): EstadoVigencia {
  if (!vencimento) return { situacao: 'NAO_ATIVADA', diasRestantes: null, aviso: false };
  if (vencimento === VENCIMENTO_VITALICIO) {
    return { situacao: 'ATIVA', diasRestantes: null, aviso: false };
  }
  const dias = diasEntre(hojeIso(agora), vencimento);
  if (dias < 0) return { situacao: 'VENCIDA', diasRestantes: dias, aviso: false };
  return { situacao: 'ATIVA', diasRestantes: dias, aviso: dias <= AVISO_VENCIMENTO_DIAS };
}
