import { describe, expect, it } from 'vitest';
import {
  calcularValorTarifa,
  COMPANHIAS,
  cotarRota,
  NIVEIS_TARIFA,
  normalizarIata,
  ROTULO_NIVEL,
  type TarifaAerea,
} from './tarifa-aerea.js';

const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

const tarifas: TarifaAerea[] = [
  {
    id: 't-gol',
    origem: 'GRU',
    destino: 'SSA',
    companhia: 'GOL',
    niveis: {
      URGENTE: { tarifaKg: '12.50', minimo: '180.00' },
      ECONOMICO: { tarifaKg: '6.00', minimo: '90.00' },
    },
  },
  {
    origem: 'gru',
    destino: 'ssa ',
    companhia: 'LATAM',
    niveis: { URGENTE: { tarifaKg: '11.00', minimo: '250.00' }, RAPIDO: null },
  },
  {
    id: 't-azul',
    origem: 'GRU',
    destino: 'SSA',
    companhia: 'AZUL',
    niveis: { URGENTE: { tarifaKg: '13.00', minimo: '150.00' } },
  },
  {
    id: 'outra-rota',
    origem: 'GRU',
    destino: 'REC',
    companhia: 'GOL',
    niveis: { URGENTE: { tarifaKg: '1.00', minimo: '1.00' } },
  },
];

describe('constantes', () => {
  it('companhias e níveis', () => {
    expect(COMPANHIAS).toEqual(['GOL', 'AZUL', 'LATAM']);
    expect(NIVEIS_TARIFA).toEqual(['URGENTE', 'RAPIDO', 'ECONOMICO']);
    expect(ROTULO_NIVEL.RAPIDO).toBe('Rápido');
  });
});

describe('calcularValorTarifa', () => {
  it('peso como digitado (sem arredondar para o kg inteiro)', () => {
    const r = calcularValorTarifa('10,5', { tarifaKg: '10', minimo: '0' });
    expect(f2(r.valor)).toBe('105.00');
  });

  it('igual ao mínimo não marca "aplicou mínimo"', () => {
    const r = calcularValorTarifa(10, { tarifaKg: 10, minimo: 100 });
    expect(r.aplicouMinimo).toBe(false);
    expect(f2(r.valor)).toBe('100.00');
  });

  it('arredonda o resultado meio para cima', () => {
    // 1,25 × 0,99 = 1,2375 → 1,24 ; 0,5 × 0,01 = 0,005 → 0,01
    expect(f2(calcularValorTarifa('1,25', { tarifaKg: '0.99', minimo: 0 }).valor)).toBe('1.24');
    expect(f2(calcularValorTarifa('0,5', { tarifaKg: '0.01', minimo: 0 }).valor)).toBe('0.01');
  });

  it('validação: peso zero/vazio/negativo e tarifa negativa', () => {
    const n = { tarifaKg: 1, minimo: 1 };
    expect(() => calcularValorTarifa(0, n)).toThrow('Peso taxado deve ser maior que zero.');
    expect(() => calcularValorTarifa('', n)).toThrow('Peso taxado é obrigatório.');
    expect(() => calcularValorTarifa(-1, n)).toThrow('Peso taxado não pode ser negativo.');
    expect(() => calcularValorTarifa(1, { tarifaKg: -1, minimo: 1 })).toThrow(
      'Tarifa/kg não pode ser negativo.',
    );
    expect(() => calcularValorTarifa(1, { tarifaKg: 1, minimo: -1 })).toThrow(
      'Mínimo não pode ser negativo.',
    );
  });
});

describe('normalizarIata', () => {
  it('aceita minúsculas e espaços', () => {
    expect(normalizarIata(' gru ')).toBe('GRU');
  });
  it('rejeita códigos inválidos', () => {
    expect(() => normalizarIata('GR', 'origem', 'Origem')).toThrow(
      'Origem: informe o código IATA com 3 letras (ex.: GRU).',
    );
    expect(() => normalizarIata('GRU1')).toThrow('Aeroporto: informe');
    expect(() => normalizarIata('G1U')).toThrow();
  });
});

describe('cotarRota (calculadora rápida)', () => {
  it('lista as companhias da rota ordenadas pelo menor custo', () => {
    // 20 kg urgente: GOL 250,00 ; LATAM 220 → mínimo 250,00 ; AZUL 260,00
    const r = cotarRota(tarifas, { origem: 'gru', destino: 'SSA', nivel: 'URGENTE', peso: 20 });
    expect(r.map((o) => [o.companhia, f2(o.valor), o.aplicouMinimo])).toEqual([
      ['GOL', '250.00', false],
      ['LATAM', '250.00', true],
      ['AZUL', '260.00', false],
    ]);
    expect(r[0]?.tarifaId).toBe('t-gol');
    expect(r[1]?.tarifaId).toBeUndefined();
    expect(f2(r[2]!.tarifaKg)).toBe('13.00');
    expect(f2(r[2]!.minimo)).toBe('150.00');
  });

  it('ignora companhias sem o nível pedido (níveis opcionais)', () => {
    const r = cotarRota(tarifas, { origem: 'GRU', destino: 'SSA', nivel: 'ECONOMICO', peso: 10 });
    expect(r.map((o) => o.companhia)).toEqual(['GOL']);
    expect(f2(r[0]!.valor)).toBe('90.00');
    expect(
      cotarRota(tarifas, { origem: 'GRU', destino: 'SSA', nivel: 'RAPIDO', peso: 10 }),
    ).toEqual([]);
  });

  it('rota sem tarifa → lista vazia', () => {
    expect(
      cotarRota(tarifas, { origem: 'SSA', destino: 'GRU', nivel: 'URGENTE', peso: 1 }),
    ).toEqual([]);
  });

  it('valida a consulta antes de calcular', () => {
    expect(() =>
      cotarRota(tarifas, { origem: 'GRU', destino: 'XX', nivel: 'URGENTE', peso: 1 }),
    ).toThrow('Destino: informe o código IATA');
    expect(() =>
      cotarRota([], { origem: 'GRU', destino: 'SSA', nivel: 'URGENTE', peso: 0 }),
    ).toThrow('Peso taxado deve ser maior que zero.');
  });
});
