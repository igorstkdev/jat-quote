import { describe, expect, it } from 'vitest';
import {
  dataIsoParaBR,
  hojeIso,
  lerData,
  validarVigencia,
  vigenciasSobrepostas,
  vigenteEm,
} from './datas.js';
import { ErroValidacao } from './erros.js';

describe('datas', () => {
  it('hoje no fuso de São Paulo', () => {
    // 02:00 UTC de 09/11 ainda é 08/11 em São Paulo (UTC-3)
    expect(hojeIso(new Date('2026-11-09T02:00:00Z'))).toBe('2026-11-08');
    expect(hojeIso(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-09');
    expect(hojeIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lerData aceita dd/mm/aaaa e ISO; vazio = null', () => {
    expect(lerData('8/11/2026')).toBe('2026-11-08');
    expect(lerData(' 31/12/2026 ')).toBe('2026-12-31');
    expect(lerData('2026-02-28')).toBe('2026-02-28');
    expect(lerData('2026-02-28T00:00:00.000Z')).toBe('2026-02-28');
    expect(lerData('')).toBeNull();
    expect(lerData(null)).toBeNull();
    expect(lerData(undefined)).toBeNull();
  });

  it('lerData rejeita formato e data inexistente', () => {
    expect(() => lerData('2026/11/08', 'validFrom', 'Início')).toThrow(
      'Início: use o formato dd/mm/aaaa.',
    );
    expect(() => lerData('31/02/2026')).toThrow('Data: data inválida (31/02/2026).');
    expect(() => lerData('29/02/2027')).toThrow(ErroValidacao);
    expect(lerData('29/02/2028')).toBe('2028-02-29');
  });

  it('dataIsoParaBR', () => {
    expect(dataIsoParaBR('2026-11-08')).toBe('08/11/2026');
  });

  it('validarVigencia', () => {
    expect(validarVigencia({ inicio: '2026-01-01', fim: null })).toEqual({
      inicio: '2026-01-01',
      fim: null,
    });
    expect(validarVigencia({ inicio: '2026-01-01', fim: '2026-01-01' }).fim).toBe('2026-01-01');
    expect(() => validarVigencia({ inicio: null, fim: null })).toThrow(
      'Informe o início da vigência.',
    );
    expect(() => validarVigencia({ inicio: '2026-02-01', fim: '2026-01-31' })).toThrow(
      'O fim da vigência não pode ser antes do início.',
    );
  });

  it('vigenciasSobrepostas (datas inclusivas, fim aberto)', () => {
    const v = (inicio: string, fim: string | null) => ({ inicio, fim });
    expect(vigenciasSobrepostas(v('2026-01-01', '2026-06-30'), v('2026-07-01', null))).toBe(false);
    expect(vigenciasSobrepostas(v('2026-07-01', null), v('2026-01-01', '2026-06-30'))).toBe(false);
    expect(vigenciasSobrepostas(v('2026-01-01', '2026-06-30'), v('2026-06-30', null))).toBe(true);
    expect(vigenciasSobrepostas(v('2026-01-01', null), v('2030-01-01', null))).toBe(true);
    expect(vigenciasSobrepostas(v('2026-03-01', '2026-03-31'), v('2026-01-01', '2026-12-31'))).toBe(
      true,
    );
  });

  it('vigenteEm', () => {
    const v = { inicio: '2026-01-01', fim: '2026-06-30' };
    expect(vigenteEm(v, '2025-12-31')).toBe(false);
    expect(vigenteEm(v, '2026-01-01')).toBe(true);
    expect(vigenteEm(v, '2026-06-30')).toBe(true);
    expect(vigenteEm(v, '2026-07-01')).toBe(false);
    expect(vigenteEm({ inicio: '2026-01-01', fim: null }, '2099-01-01')).toBe(true);
  });
});
