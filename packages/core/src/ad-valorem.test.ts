import { describe, expect, it } from 'vitest';
import {
  AD_VALOREM_PADRAO,
  calcularAdValorem,
  resolverAdValoremPct,
  textoCondicaoAdValorem,
} from './ad-valorem.js';
import { D } from './money.js';

describe('resolverAdValoremPct', () => {
  it('padrões por modal: aéreo 0,47% e rodoviário 0,15%', () => {
    expect(AD_VALOREM_PADRAO).toEqual({ AEREO: '0.47', RODOVIARIO: '0.15' });
    expect(resolverAdValoremPct('AEREO').toString()).toBe('0.47');
    expect(resolverAdValoremPct('RODOVIARIO', '').toString()).toBe('0.15');
    expect(resolverAdValoremPct('RODOVIARIO', null).toString()).toBe('0.15');
  });

  it('valor informado substitui o padrão', () => {
    expect(resolverAdValoremPct('AEREO', '0,3').toString()).toBe('0.3');
    expect(resolverAdValoremPct('AEREO', 0).toString()).toBe('0');
  });

  it('padrões configurados pelo Admin', () => {
    expect(
      resolverAdValoremPct('AEREO', undefined, { AEREO: '0.5', RODOVIARIO: '0.2' }).toString(),
    ).toBe('0.5');
  });

  it('rejeita negativo e acima de 100%', () => {
    expect(() => resolverAdValoremPct('AEREO', '-0,1')).toThrow(
      'Ad valorem (%) não pode ser negativo.',
    );
    expect(() => resolverAdValoremPct('AEREO', '150')).toThrow(
      'Ad valorem (%) não pode ser maior que 100.',
    );
  });
});

describe('calcularAdValorem (informativo)', () => {
  it('sem valor de mercadoria: sem estimativa', () => {
    const r = calcularAdValorem(new D('0.15'));
    expect(r.valorMercadoria).toBeNull();
    expect(r.estimativa).toBeNull();
    expect(r.condicao).toBe(
      'Ad valorem de 0,15% sobre o valor da nota fiscal, cobrado adicionalmente.',
    );
  });

  it('com valor de mercadoria: estimativa arredondada meio para cima', () => {
    // 10.001,00 × 0,15% = 15,0015 → 15,00 ; 3.333,00 × 0,47% = 15,6651 → 15,67
    expect(calcularAdValorem(new D('0.15'), '10.001,00').estimativa?.toFixed(2)).toBe('15.00');
    expect(calcularAdValorem(new D('0.47'), '3333').estimativa?.toFixed(2)).toBe('15.67');
    // 1.000,00 × 0,25% = 2,50 exato; 1 × 0,5% = 0,005 → 0,01
    expect(calcularAdValorem(new D('0.5'), '1').estimativa?.toFixed(2)).toBe('0.01');
  });

  it('rejeita valor de mercadoria negativo ou com mais de 2 casas', () => {
    expect(() => calcularAdValorem(new D('0.15'), '-1')).toThrow(
      'Valor da mercadoria não pode ser negativo.',
    );
    expect(() => calcularAdValorem(new D('0.15'), '1,001')).toThrow('no máximo 2 casas');
  });

  it('texto da condição comercial', () => {
    expect(textoCondicaoAdValorem('0.47')).toBe(
      'Ad valorem de 0,47% sobre o valor da nota fiscal, cobrado adicionalmente.',
    );
  });
});
