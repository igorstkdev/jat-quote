/**
 * TESTES DE REFERÊNCIA (golden tests) — CLAUDE.md §4.
 * Estes valores vêm do CLAUDE.md e do app atual. NUNCA altere sem aprovação.
 */
import { describe, expect, it } from 'vitest';
import { calcularCubagem } from './cubagem.js';
import { calcularFtl } from './ftl.js';
import { calcularSpot } from './spot.js';
import { calcularValorTarifa } from './tarifa-aerea.js';

const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

describe('Golden: Frete Spot', () => {
  it('Rodoviário: custo 1.000, markup 10%, pedágio 100 → subtotal 1.100,00 e total 1.200,00', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: 1000 },
      markupPct: 10,
      pedagio: 100,
    });
    expect(f2(r.subtotal)).toBe('1100.00');
    expect(f2(r.total)).toBe('1200.00');
    // Ad valorem 0,15% fora do total
    expect(r.adValorem.pct.toString()).toBe('0.15');
    expect(f2(r.total)).toBe(f2(r.subtotal.plus(r.pedagio)));
  });

  it('Ad valorem não altera o total, mesmo com valor de mercadoria', () => {
    const base = {
      modal: 'RODOVIARIO' as const,
      custos: { RODOVIARIO: 1000 },
      markupPct: 10,
      pedagio: 100,
    };
    const com = calcularSpot({ ...base, valorMercadoria: '50000', adValoremPct: '5' });
    expect(f2(com.total)).toBe('1200.00');
    expect(f2(com.adValorem.estimativa!)).toBe('2500.00');
  });

  it('Rodoviário (app atual): 350, markup 70%, pedágio 150 → MKUP 245, subtotal 595, total 745', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: '350' },
      markupPct: '70',
      pedagio: '150',
    });
    expect(f2(r.markupTotal)).toBe('245.00');
    expect(f2(r.subtotal)).toBe('595.00');
    expect(f2(r.pedagio)).toBe('150.00');
    expect(f2(r.total)).toBe('745.00');
  });

  it('Aéreo (app atual): 300 + 600 + 150, markup 70%, pedágio 150 → MKUP 735, subtotal 1.785, total 1.935', () => {
    const r = calcularSpot({
      modal: 'AEREO',
      custos: { COLETA: '300', AEREO: '600', ENTREGA: '150' },
      markupPct: '70',
      pedagio: '150',
    });
    expect(f2(r.somaCustos)).toBe('1050.00');
    expect(f2(r.markupTotal)).toBe('735.00');
    expect(f2(r.subtotal)).toBe('1785.00');
    expect(f2(r.total)).toBe('1935.00');
    expect(r.componentes.map((c) => [c.componente, f2(c.comMarkup)])).toEqual([
      ['COLETA', '510.00'],
      ['AEREO', '1020.00'],
      ['ENTREGA', '255.00'],
    ]);
    expect(r.adValorem.pct.toString()).toBe('0.47');
  });
});

describe('Golden: Cubagem', () => {
  it('1×1×1 m, 10 kg → aéreo 166,67 kg', () => {
    const r = calcularCubagem({
      modal: 'AEREO',
      volumes: [{ comprimentoM: 1, larguraM: 1, alturaM: 1, pesoBrutoKg: 10 }],
    });
    expect(f2(r.pesoCubadoTotal)).toBe('166.67');
    expect(f2(r.pesoTaxadoTotal)).toBe('166.67');
  });

  it('1×1×1 m, 10 kg → rodoviário 300,00 kg', () => {
    const r = calcularCubagem({
      modal: 'RODOVIARIO',
      volumes: [{ comprimentoM: 1, larguraM: 1, alturaM: 1, pesoBrutoKg: 10 }],
    });
    expect(f2(r.pesoCubadoTotal)).toBe('300.00');
    expect(f2(r.pesoTaxadoTotal)).toBe('300.00');
  });

  it('App atual: 0,4 × 0,3 × 0,3 m, 3 kg, rodoviário → cubado 10,80, taxado 10,80', () => {
    const r = calcularCubagem({
      modal: 'RODOVIARIO',
      volumes: [{ comprimentoM: '0,4', larguraM: '0,3', alturaM: '0,3', pesoBrutoKg: '3' }],
    });
    expect(f2(r.pesoBrutoTotal)).toBe('3.00');
    expect(f2(r.pesoCubadoTotal)).toBe('10.80');
    expect(f2(r.pesoTaxadoTotal)).toBe('10.80');
  });

  it('App atual: 0,5 × 0,8 × 1,2 m, 200 kg, rodoviário → cubado 144,00, taxado 200,00', () => {
    const r = calcularCubagem({
      modal: 'RODOVIARIO',
      volumes: [{ comprimentoM: '0,50', larguraM: '0,80', alturaM: '1,20', pesoBrutoKg: '200' }],
    });
    expect(f2(r.pesoBrutoTotal)).toBe('200.00');
    expect(f2(r.pesoCubadoTotal)).toBe('144.00');
    expect(f2(r.pesoTaxadoTotal)).toBe('200.00');
  });
});

describe('Golden: Tarifa aérea', () => {
  it('peso × tarifa abaixo do mínimo → cobra o mínimo', () => {
    const r = calcularValorTarifa(10, { tarifaKg: '5.00', minimo: '120.00' });
    expect(f2(r.calculado)).toBe('50.00');
    expect(f2(r.valor)).toBe('120.00');
    expect(r.aplicouMinimo).toBe(true);
  });

  it('peso × tarifa acima do mínimo → cobra o calculado', () => {
    const r = calcularValorTarifa(100, { tarifaKg: '5.00', minimo: '120.00' });
    expect(f2(r.valor)).toBe('500.00');
    expect(r.aplicouMinimo).toBe(false);
  });
});

describe('Golden: Cubagem com vários volumes (app atual, por embarque)', () => {
  it('Rodoviário: 0,5×0,8×1,2 200 kg + 0,2×0,4×0,45 3 kg → bruto 203, cubado 154,80, taxado 203,00', () => {
    const r = calcularCubagem({
      modal: 'RODOVIARIO',
      volumes: [
        { comprimentoM: '0,50', larguraM: '0,80', alturaM: '1,20', pesoBrutoKg: '200' },
        { comprimentoM: '0,20', larguraM: '0,40', alturaM: '0,45', pesoBrutoKg: '3' },
      ],
    });
    expect(f2(r.pesoBrutoTotal)).toBe('203.00');
    expect(f2(r.pesoCubadoTotal)).toBe('154.80');
    expect(f2(r.pesoTaxadoTotal)).toBe('203.00');
    expect(r.volumes.map((v) => f2(v.pesoTaxado))).toEqual(['200.00', '10.80']);
  });

  it('Aéreo: 3 volumes → bruto 207, cubado 102,88, taxado 207,00 (16,875 → 16,88)', () => {
    const r = calcularCubagem({
      modal: 'AEREO',
      volumes: [
        { comprimentoM: '0,50', larguraM: '0,80', alturaM: '1,20', pesoBrutoKg: '200' },
        { comprimentoM: '0,20', larguraM: '0,40', alturaM: '0,45', pesoBrutoKg: '3' },
        { comprimentoM: '0,50', larguraM: '0,45', alturaM: '0,45', pesoBrutoKg: '4' },
      ],
    });
    expect(r.volumes.map((v) => [f2(v.pesoCubado), f2(v.pesoTaxado)])).toEqual([
      ['80.00', '200.00'],
      ['6.00', '6.00'],
      ['16.88', '16.88'],
    ]);
    expect(f2(r.pesoBrutoTotal)).toBe('207.00');
    expect(f2(r.pesoCubadoTotal)).toBe('102.88');
    expect(f2(r.pesoTaxadoTotal)).toBe('207.00');
  });
});

describe('Golden: FTL Fiat (app atual)', () => {
  it('SP Capital, VAN R$ 3,60/km, 300 km → R$ 1.080,00; ad valorem 0,5% informativo', () => {
    const r = calcularFtl({
      tarifa: {
        uf: 'SP',
        regiao: 'Grande SP',
        localidade: 'CAPITAL',
        tarifaKm: { UTILITARIO: '2.50', VAN: '3.60', TRES_QUARTOS: '4.00' },
        adValoremPct: '0.5',
      },
      veiculo: 'VAN',
      distanciaKm: '300',
    });
    expect(f2(r.total)).toBe('1080.00');
    expect(r.adValorem.pct.toString()).toBe('0.5');
  });
});
