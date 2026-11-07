import { ErroValidacao } from './erros.js';
import { D, roundMoney, type Dec, type DecimalInput } from './money.js';
import { numeroNaoNegativo, type Entrada } from './numeros.js';

export type Companhia = 'GOL' | 'AZUL' | 'LATAM';
export const COMPANHIAS: readonly Companhia[] = Object.freeze(['GOL', 'AZUL', 'LATAM']);

export type NivelTarifa = 'URGENTE' | 'RAPIDO' | 'ECONOMICO';
export const NIVEIS_TARIFA: readonly NivelTarifa[] = Object.freeze([
  'URGENTE',
  'RAPIDO',
  'ECONOMICO',
]);
export const ROTULO_NIVEL: Readonly<Record<NivelTarifa, string>> = Object.freeze({
  URGENTE: 'Urgente',
  RAPIDO: 'Rápido',
  ECONOMICO: 'Econômico',
});

export interface ValoresNivel {
  tarifaKg: DecimalInput;
  minimo: DecimalInput;
}

export interface TarifaAerea {
  id?: string;
  origem: string;
  destino: string;
  companhia: Companhia;
  /** Os 3 níveis são opcionais (CLAUDE.md §3.3). */
  niveis: Partial<Record<NivelTarifa, ValoresNivel | null>>;
}

export interface ValorTarifa {
  /** Peso × tarifa/kg (arredondado). */
  calculado: Dec;
  /** MAX(peso × tarifa/kg, mínimo) (arredondado). */
  valor: Dec;
  /** true quando o mínimo foi cobrado. */
  aplicouMinimo: boolean;
}

/** Peso usado na tarifa: como digitado, sem arredondar para o kg inteiro. */
export function pesoTarifa(peso: Entrada): Dec {
  return numeroNaoNegativo(peso, { campo: 'peso', rotulo: 'Peso taxado', permiteZero: false });
}

/** `Valor = MAX(Peso × Tarifa/kg, Mínimo)` (CLAUDE.md §3.3). */
export function calcularValorTarifa(peso: Entrada, nivel: ValoresNivel): ValorTarifa {
  const p = pesoTarifa(peso);
  const tarifaKg = numeroNaoNegativo(nivel.tarifaKg, { campo: 'tarifaKg', rotulo: 'Tarifa/kg' });
  const minimo = numeroNaoNegativo(nivel.minimo, { campo: 'minimo', rotulo: 'Mínimo' });
  const calculado = p.times(tarifaKg);
  const aplicouMinimo = calculado.lessThan(minimo);
  return {
    calculado: roundMoney(calculado),
    valor: roundMoney(aplicouMinimo ? minimo : calculado),
    aplicouMinimo,
  };
}

/** Normaliza e valida um código IATA (3 letras). */
export function normalizarIata(codigo: string, campo = 'iata', rotulo = 'Aeroporto'): string {
  const c = codigo.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) {
    throw new ErroValidacao(campo, `${rotulo}: informe o código IATA com 3 letras (ex.: GRU).`);
  }
  return c;
}

export interface ConsultaRota {
  origem: string;
  destino: string;
  nivel: NivelTarifa;
  peso: Entrada;
}

export interface OpcaoRota extends ValorTarifa {
  companhia: Companhia;
  tarifaId?: string;
  tarifaKg: Dec;
  minimo: Dec;
}

/**
 * Calculadora rápida (CLAUDE.md §3.3): lista as companhias da rota que têm o
 * nível pedido, **ordenadas pelo menor custo** (empate: ordem alfabética).
 * Vigência e status (ativa/inativa) são filtrados antes, pela API.
 */
export function cotarRota(tarifas: readonly TarifaAerea[], consulta: ConsultaRota): OpcaoRota[] {
  const origem = normalizarIata(consulta.origem, 'origem', 'Origem');
  const destino = normalizarIata(consulta.destino, 'destino', 'Destino');
  pesoTarifa(consulta.peso);

  const opcoes: OpcaoRota[] = [];
  for (const t of tarifas) {
    if (t.origem.trim().toUpperCase() !== origem || t.destino.trim().toUpperCase() !== destino) {
      continue;
    }
    const nivel = t.niveis[consulta.nivel];
    if (!nivel) continue;
    opcoes.push({
      companhia: t.companhia,
      ...(t.id !== undefined ? { tarifaId: t.id } : {}),
      tarifaKg: new D(nivel.tarifaKg),
      minimo: new D(nivel.minimo),
      ...calcularValorTarifa(consulta.peso, nivel),
    });
  }

  return opcoes.sort(
    (a, b) => a.valor.comparedTo(b.valor) || a.companhia.localeCompare(b.companhia),
  );
}
