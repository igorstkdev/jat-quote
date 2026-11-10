import { describe, expect, it } from 'vitest';
import { ehPeriodo, intervalo } from './periodo';

describe('atalhos de período', () => {
  const hoje = '2026-11-08';
  it('dias e meses', () => {
    expect(intervalo('hoje', hoje)).toEqual({ from: hoje, to: hoje });
    expect(intervalo('7d', hoje)).toEqual({ from: '2026-11-02', to: hoje });
    expect(intervalo('mes', hoje)).toEqual({ from: '2026-11-01', to: hoje });
    expect(intervalo('mes-passado', hoje)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(intervalo('3m', hoje)).toEqual({ from: '2026-09-01', to: hoje });
    expect(intervalo('12m', hoje)).toEqual({ from: '2025-12-01', to: hoje });
    expect(intervalo('ano', hoje)).toEqual({ from: '2026-01-01', to: hoje });
    expect(intervalo('tudo', hoje)).toEqual({ from: '', to: '' });
  });
  it('vira o ano', () => {
    expect(intervalo('mes-passado', '2027-01-15')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(intervalo('3m', '2027-02-10')).toEqual({ from: '2026-12-01', to: '2027-02-10' });
    expect(intervalo('12m', '2026-12-05')).toEqual({ from: '2026-01-01', to: '2026-12-05' });
    expect(intervalo('7d', '2027-01-03')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(intervalo('mes-passado', '2028-03-01').to).toBe('2028-02-29');
  });
  it('valida o valor vindo do endereço', () => {
    expect(ehPeriodo('mes')).toBe(true);
    expect(ehPeriodo('xyz')).toBe(false);
    expect(ehPeriodo(null)).toBe(false);
  });
});
