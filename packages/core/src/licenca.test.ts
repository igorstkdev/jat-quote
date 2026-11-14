import { describe, expect, it } from 'vitest';
import { calcularVencimento, diasEntre, situacaoVigencia, somarMeses } from './licenca.js';

/** Meio-dia em São Paulo no dia informado. */
const em = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

describe('somarMeses', () => {
  it('soma meses de calendário', () => {
    expect(somarMeses('2026-11-14', 1)).toBe('2026-12-14');
    expect(somarMeses('2026-11-14', 3)).toBe('2027-02-14');
    expect(somarMeses('2026-11-14', 6)).toBe('2027-05-14');
    expect(somarMeses('2026-11-14', 12)).toBe('2027-11-14');
  });
  it('dia inexistente vira o último dia do mês', () => {
    expect(somarMeses('2027-01-31', 1)).toBe('2027-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-08-31', 3)).toBe('2026-11-30');
  });
});

describe('calcularVencimento', () => {
  it('primeira ativação conta a partir de hoje', () => {
    expect(calcularVencimento('MENSAL', '2026-11-14')).toBe('2026-12-14');
    expect(calcularVencimento('ANUAL', '2026-11-14', null)).toBe('2027-11-14');
  });
  it('renovação antes de vencer soma ao que falta', () => {
    // Vence em 04/12; renova 3 meses em 14/11 → 04/03.
    expect(calcularVencimento('TRIMESTRAL', '2026-11-14', '2026-12-04')).toBe('2027-03-04');
    // Vence hoje: ainda vale, soma.
    expect(calcularVencimento('MENSAL', '2026-12-04', '2026-12-04')).toBe('2027-01-04');
  });
  it('plano vencido conta a partir de hoje', () => {
    expect(calcularVencimento('SEMESTRAL', '2026-11-14', '2026-10-01')).toBe('2027-05-14');
  });
});

describe('situacaoVigencia', () => {
  it('não ativada', () => {
    expect(situacaoVigencia(null).situacao).toBe('NAO_ATIVADA');
  });
  it('vale até o fim do dia do vencimento (horário de Brasília)', () => {
    expect(situacaoVigencia('2026-12-14', new Date('2026-12-14T23:59:00-03:00'))).toEqual({
      situacao: 'ATIVA',
      diasRestantes: 0,
      aviso: true,
    });
    expect(situacaoVigencia('2026-12-14', new Date('2026-12-15T00:00:30-03:00')).situacao).toBe(
      'VENCIDA',
    );
  });
  it('avisa com 15 dias ou menos', () => {
    expect(situacaoVigencia('2026-12-14', em('2026-11-29'))).toMatchObject({ aviso: true });
    expect(situacaoVigencia('2026-12-14', em('2026-11-29')).diasRestantes).toBe(15);
    expect(situacaoVigencia('2026-12-14', em('2026-11-28')).diasRestantes).toBe(16);
    expect(situacaoVigencia('2026-12-14', em('2026-11-28')).aviso).toBe(false);
  });
  it('diasEntre', () => {
    expect(diasEntre('2026-11-14', '2026-12-14')).toBe(30);
    expect(diasEntre('2026-12-14', '2026-11-14')).toBe(-30);
  });
});
