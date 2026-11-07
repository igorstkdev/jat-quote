import { describe, expect, it } from 'vitest';
import { formatBRL, roundMoney } from './money.js';

describe('roundMoney (arredondamento comercial, meio para cima)', () => {
  it('arredonda 0,005 para cima', () => {
    expect(roundMoney('0.005').toFixed(2)).toBe('0.01');
    expect(roundMoney('2.345').toFixed(2)).toBe('2.35');
  });

  it('arredonda 2,5 centavos para 3 (não para o par)', () => {
    expect(roundMoney('0.025').toFixed(2)).toBe('0.03');
  });

  it('negativos: meio se afasta do zero, como no Excel', () => {
    expect(roundMoney('-0.005').toFixed(2)).toBe('-0.01');
  });

  it('não sofre erro de ponto flutuante (0,1 + 0,2)', () => {
    expect(roundMoney('0.1').plus('0.2').toFixed(2)).toBe('0.30');
  });
});

describe('formatBRL', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatBRL('1234.56')).toBe('R$ 1.234,56');
    expect(formatBRL('1935')).toBe('R$ 1.935,00');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatBRL (casos de borda)', () => {
  it('valores grandes e negativos', () => {
    expect(formatBRL('1234567.891')).toBe('R$ 1.234.567,89');
    expect(formatBRL('-1500.5')).toBe('-R$ 1.500,50');
    expect(formatBRL('-0.001')).toBe('R$ 0,00');
  });
});
