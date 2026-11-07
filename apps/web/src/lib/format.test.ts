import { describe, expect, it } from 'vitest';
import { brParaIso, mascaraData } from '@/components/date-input';
import { formatDataHora, formatDocumento, iniciais, saudacao } from './format';

describe('formatação', () => {
  it('documento', () => {
    expect(formatDocumento('16701716000156')).toBe('16.701.716/0001-56');
    expect(formatDocumento('12345678901')).toBe('123.456.789-01');
    expect(formatDocumento(null)).toBe('');
  });
  it('data e hora em São Paulo', () => {
    expect(formatDataHora('2026-11-07T15:05:00Z')).toBe('07/11/2026 12:05');
  });
  it('saudação pela hora de São Paulo', () => {
    expect(saudacao(new Date('2026-11-07T11:00:00Z'))).toBe('Bom dia');
    expect(saudacao(new Date('2026-11-07T18:00:00Z'))).toBe('Boa tarde');
    expect(saudacao(new Date('2026-11-07T23:00:00Z'))).toBe('Boa noite');
  });
  it('iniciais', () => {
    expect(iniciais('Ana Maria Souza')).toBe('AS');
    expect(iniciais('bruno')).toBe('B');
  });
});

describe('campo de data dd/mm/aaaa', () => {
  it('máscara', () => {
    expect(mascaraData('07112026')).toBe('07/11/2026');
    expect(mascaraData('0711')).toBe('07/11');
    expect(mascaraData('07/1')).toBe('07/1');
  });
  it('conversão para ISO e validação', () => {
    expect(brParaIso('07/11/2026')).toBe('2026-11-07');
    expect(brParaIso('31/02/2026')).toBeNull();
    expect(brParaIso('07/11')).toBeNull();
  });
});
