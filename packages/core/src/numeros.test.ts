import { describe, expect, it } from 'vitest';
import { ErroValidacao } from './erros.js';
import { D } from './money.js';
import {
  arred2,
  formatNumero,
  formatPercentual,
  formatPeso,
  numeroNaoNegativo,
  parseNumero,
} from './numeros.js';

describe('parseNumero (padrão brasileiro)', () => {
  it.each([
    ['0,4', '0.4'],
    ['1.234,56', '1234.56'],
    ['1234,5', '1234.5'],
    ['0.4', '0.4'],
    ['1234.56', '1234.56'],
    ['1.234.567', '1234567'],
    [' 12 ', '12'],
    ['-3,5', '-3.5'],
    ['10.', '10'],
    [',5', '0.5'],
  ])('"%s" → %s', (entrada, esperado) => {
    expect(parseNumero(entrada)?.toString()).toBe(esperado);
  });

  it('vazio, só espaços, null e undefined → null', () => {
    expect(parseNumero('')).toBeNull();
    expect(parseNumero('   ')).toBeNull();
    expect(parseNumero(null)).toBeNull();
    expect(parseNumero(undefined)).toBeNull();
  });

  it('aceita número e Decimal', () => {
    expect(parseNumero(12.5)?.toString()).toBe('12.5');
    expect(parseNumero(new D('7'))?.toString()).toBe('7');
  });

  it('rejeita texto inválido com mensagem em português', () => {
    expect(() => parseNumero('abc', 'custo', 'Custo')).toThrow(
      'Custo inválido: use apenas números (ex.: 1.234,56).',
    );
    expect(() => parseNumero('1,2,3')).toThrow(ErroValidacao);
    expect(() => parseNumero('1e5')).toThrow(ErroValidacao);
  });

  it('rejeita NaN e infinito', () => {
    expect(() => parseNumero(Number.NaN, 'x', 'Peso')).toThrow('Peso inválido.');
    expect(() => parseNumero(Number.POSITIVE_INFINITY)).toThrow(ErroValidacao);
  });
});

describe('numeroNaoNegativo', () => {
  const base = { campo: 'c', rotulo: 'Campo' };

  it('vazio sem padrão é obrigatório', () => {
    expect(() => numeroNaoNegativo('', base)).toThrow('Campo é obrigatório.');
  });

  it('vazio com padrão usa o padrão', () => {
    expect(numeroNaoNegativo(undefined, { ...base, padrao: 0 }).toString()).toBe('0');
  });

  it('negativo: mensagem padrão e personalizada', () => {
    expect(() => numeroNaoNegativo('-1', base)).toThrow('Campo não pode ser negativo.');
    expect(() => numeroNaoNegativo(-1, { ...base, msgNegativo: 'Nada de negativo.' })).toThrow(
      'Nada de negativo.',
    );
  });

  it('"-0" vira 0', () => {
    const n = numeroNaoNegativo('-0', base);
    expect(n.isZero()).toBe(true);
    expect(n.isNegative()).toBe(false);
  });

  it('zero proibido quando permiteZero = false', () => {
    expect(() => numeroNaoNegativo('0', { ...base, permiteZero: false })).toThrow(
      'Campo deve ser maior que zero.',
    );
  });

  it('máximo e casas decimais', () => {
    expect(() => numeroNaoNegativo('101', { ...base, maximo: 100 })).toThrow(
      'Campo não pode ser maior que 100.',
    );
    expect(() => numeroNaoNegativo('1,234', { ...base, casas: 2 })).toThrow(
      'Campo: use no máximo 2 casas decimais.',
    );
    expect(numeroNaoNegativo('100', { ...base, maximo: 100, casas: 2 }).toString()).toBe('100');
  });

  it('erro carrega o nome do campo', () => {
    try {
      numeroNaoNegativo('-5', { campo: 'pedagio', rotulo: 'Pedágio' });
    } catch (e) {
      expect(e).toBeInstanceOf(ErroValidacao);
      expect((e as ErroValidacao).campo).toBe('pedagio');
      expect((e as ErroValidacao).name).toBe('ErroValidacao');
    }
    expect.assertions(3);
  });
});

describe('formatação', () => {
  it('arred2 meio para cima', () => {
    expect(arred2(new D('166.667')).toString()).toBe('166.67');
    expect(arred2(new D('0.125')).toString()).toBe('0.13');
  });

  it('formatNumero', () => {
    expect(formatNumero('1234567.891')).toBe('1.234.567,89');
    expect(formatNumero('10.8')).toBe('10,80');
    expect(formatNumero('-2.5')).toBe('-2,50');
    expect(formatNumero('-0.001')).toBe('0,00');
    expect(formatNumero('5', 0)).toBe('5');
  });

  it('formatPeso e formatPercentual', () => {
    expect(formatPeso('10.8')).toBe('10,80 kg');
    expect(formatPercentual('0.15')).toBe('0,15%');
    expect(formatPercentual('0.1')).toBe('0,10%');
    expect(formatPercentual('0.1234')).toBe('0,1234%');
    expect(formatPercentual('0.12345')).toBe('0,1235%');
  });
});
