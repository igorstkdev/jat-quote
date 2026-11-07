import { describe, expect, it } from 'vitest';
import { calcularFtl, KM_MINIMO_FTL, ROTULO_VEICULO, VEICULOS_FTL, type TarifaFtl } from './ftl.js';

const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

const tarifaBA: TarifaFtl = {
  uf: 'BA',
  regiao: 'Nordeste',
  localidade: 'CAPITAL',
  tarifaKm: { UTILITARIO: '2.10', VAN: '2.85', TRES_QUARTOS: '3.40' },
  adValoremPct: '0.15',
};

describe('calcularFtl', () => {
  it('veículos e rótulos', () => {
    expect(VEICULOS_FTL).toEqual(['UTILITARIO', 'VAN', 'TRES_QUARTOS']);
    expect(ROTULO_VEICULO.TRES_QUARTOS).toBe('1.5T');
  });

  it('frete = distância × tarifa/km do veículo', () => {
    // Sem vírgula, um único ponto é DECIMAL (formato de máquina, como vem da API).
    // Com vírgula, vale o padrão brasileiro. A tela envia sempre um dos dois formatos.
    const r = calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: '30.5' });
    expect(r.distanciaKm.toString()).toBe('30.5');
    expect(
      calcularFtl({
        tarifa: tarifaBA,
        veiculo: 'VAN',
        distanciaKm: '1.962,0',
      }).distanciaKm.toString(),
    ).toBe('1962');
    const r2 = calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: '1962' });
    expect(f2(r2.total)).toBe('5591.70');
    expect(f2(r2.tarifaKm)).toBe('2.85');
  });

  it('distância fracionada e arredondamento meio para cima', () => {
    // 100,5 × 3,40 = 341,70 ; 25,5 × 2,11 = 53,805 → 53,81
    expect(
      f2(calcularFtl({ tarifa: tarifaBA, veiculo: 'TRES_QUARTOS', distanciaKm: '100,5' }).total),
    ).toBe('341.70');
    const t = { ...tarifaBA, tarifaKm: { ...tarifaBA.tarifaKm, UTILITARIO: '2.11' } };
    expect(f2(calcularFtl({ tarifa: t, veiculo: 'UTILITARIO', distanciaKm: '25,5' }).total)).toBe(
      '53.81',
    );
  });

  it('ad valorem da tabela é informativo e fica fora do total', () => {
    const r = calcularFtl({
      tarifa: tarifaBA,
      veiculo: 'UTILITARIO',
      distanciaKm: 100,
      valorMercadoria: '80.000,00',
    });
    expect(f2(r.total)).toBe('210.00');
    expect(r.adValorem.pct.toString()).toBe('0.15');
    expect(f2(r.adValorem.estimativa!)).toBe('120.00');
  });

  it('validação', () => {
    expect(() => calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: 0 })).toThrow(
      'Distância (km) deve ser maior que zero.',
    );
    expect(() => calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: '' })).toThrow(
      'Distância (km) é obrigatório.',
    );
    // Mínimo de 25 km: abaixo bloqueia; exatamente 25 é aceito
    expect(() => calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: '24,99' })).toThrow(
      'KM da rota: mínimo 25 km.',
    );
    expect(KM_MINIMO_FTL).toBe(25);
    expect(f2(calcularFtl({ tarifa: tarifaBA, veiculo: 'VAN', distanciaKm: 25 }).total)).toBe(
      '71.25',
    );
    expect(() =>
      calcularFtl({ tarifa: { ...tarifaBA, adValoremPct: '-1' }, veiculo: 'VAN', distanciaKm: 30 }),
    ).toThrow('Ad valorem (%) não pode ser negativo.');
    expect(() =>
      calcularFtl({
        tarifa: { ...tarifaBA, tarifaKm: { ...tarifaBA.tarifaKm, VAN: '-1' } },
        veiculo: 'VAN',
        distanciaKm: 30,
      }),
    ).toThrow('Tarifa/km (VAN) não pode ser negativo.');
    expect(() =>
      calcularFtl({ tarifa: tarifaBA, veiculo: 'CARRETA' as never, distanciaKm: 30 }),
    ).toThrow('Veículo desconhecido');
  });
});
