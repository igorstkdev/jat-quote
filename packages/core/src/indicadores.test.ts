import { describe, expect, it } from 'vitest';
import { mesDe, mesesEntre, rotuloMes, taxaConversao } from './indicadores.js';

describe('taxa de conversão = Aprovadas ÷ (Aprovadas + Declinadas)', () => {
  it('calcula em % sem arredondar', () => {
    expect(taxaConversao(3, 1)!.toString()).toBe('75');
    expect(taxaConversao(1, 2)!.toFixed(4)).toBe('33.3333');
    expect(taxaConversao(0, 5)!.toString()).toBe('0');
    expect(taxaConversao(4, 0)!.toString()).toBe('100');
  });
  it('sem aprovadas nem declinadas → null', () => {
    expect(taxaConversao(0, 0)).toBeNull();
  });
});

describe('meses', () => {
  it('mês de uma data', () => {
    expect(mesDe('2026-11-08')).toBe('2026-11');
  });
  it('lista os meses do intervalo, virando o ano', () => {
    expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(mesesEntre('2026-03', '2026-03')).toEqual(['2026-03']);
    expect(mesesEntre('2026-04', '2026-03')).toEqual([]);
  });
  it('rótulo curto em português', () => {
    expect(rotuloMes('2026-11')).toBe('nov/26');
    expect(rotuloMes('2027-01')).toBe('jan/27');
  });
});
