import { describe, expect, it } from 'vitest';
import { ErroValidacao } from './erros.js';
import { calcularSpot, COMPONENTES_POR_MODAL } from './spot.js';

const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

describe('calcularSpot — estrutura', () => {
  it('componentes por modal', () => {
    expect(COMPONENTES_POR_MODAL.RODOVIARIO).toEqual(['RODOVIARIO']);
    expect(COMPONENTES_POR_MODAL.AEREO).toEqual(['COLETA', 'AEREO', 'ENTREGA']);
  });

  it('rodoviário ignora custos de componentes aéreos', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: 100, COLETA: 999, AEREO: 999 },
    });
    expect(r.componentes).toHaveLength(1);
    expect(r.componentes[0]?.rotulo).toBe('Custo Rodoviário');
    expect(f2(r.total)).toBe('100.00');
  });

  it('aéreo ignora o custo rodoviário', () => {
    const r = calcularSpot({ modal: 'AEREO', custos: { RODOVIARIO: 999, AEREO: 10 } });
    expect(f2(r.somaCustos)).toBe('10.00');
    expect(r.componentes.map((c) => c.rotulo)).toEqual([
      'Custo de Coleta',
      'Custo Aéreo',
      'Custo de Entrega',
    ]);
  });

  it('modal desconhecido falha', () => {
    expect(() => calcularSpot({ modal: 'MARITIMO' as never, custos: {} })).toThrow(
      'Modal desconhecido',
    );
  });
});

describe('calcularSpot — campos vazios e zeros', () => {
  it('tudo vazio → tudo zero, ad valorem no padrão', () => {
    const r = calcularSpot({ modal: 'AEREO', custos: { COLETA: '', AEREO: null } });
    expect(f2(r.total)).toBe('0.00');
    expect(f2(r.markupTotal)).toBe('0.00');
    expect(r.markupPct.toString()).toBe('0');
    expect(r.adValorem.pct.toString()).toBe('0.47');
  });

  it('sem markup: subtotal = soma; total = soma + pedágio', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: '1.234,56' },
      pedagio: '10,44',
    });
    expect(f2(r.subtotal)).toBe('1234.56');
    expect(f2(r.total)).toBe('1245.00');
  });

  it('só pedágio: pedágio não recebe markup', () => {
    const r = calcularSpot({ modal: 'RODOVIARIO', custos: {}, pedagio: 50, markupPct: 100 });
    expect(f2(r.subtotal)).toBe('0.00');
    expect(f2(r.total)).toBe('50.00');
  });
});

describe('calcularSpot — validação', () => {
  it('markup negativo não é permitido', () => {
    expect(() =>
      calcularSpot({ modal: 'RODOVIARIO', custos: { RODOVIARIO: 100 }, markupPct: '-5' }),
    ).toThrow('O markup não pode ser negativo.');
  });

  it('custo e pedágio negativos', () => {
    expect(() => calcularSpot({ modal: 'AEREO', custos: { ENTREGA: -1 } })).toThrow(
      'Custo de Entrega não pode ser negativo.',
    );
    expect(() =>
      calcularSpot({ modal: 'RODOVIARIO', custos: { RODOVIARIO: 1 }, pedagio: '-0,01' }),
    ).toThrow('Pedágio não pode ser negativo.');
  });

  it('valores monetários com mais de 2 casas', () => {
    try {
      calcularSpot({ modal: 'RODOVIARIO', custos: { RODOVIARIO: '10,005' } });
    } catch (e) {
      expect(e).toBeInstanceOf(ErroValidacao);
      expect((e as ErroValidacao).campo).toBe('custos.RODOVIARIO');
      expect((e as ErroValidacao).message).toBe(
        'Custo Rodoviário: use no máximo 2 casas decimais.',
      );
    }
    expect.assertions(3);
  });

  it('texto inválido', () => {
    expect(() => calcularSpot({ modal: 'RODOVIARIO', custos: { RODOVIARIO: 'mil' } })).toThrow(
      'Custo Rodoviário inválido',
    );
  });
});

describe('calcularSpot — arredondamento (só no resultado final)', () => {
  it('markup fracionado: arredonda só no fim, meio para cima', () => {
    // 100,01 × 1,125 = 112,51125 → 112,51 ; MKUP = 12,50125 → 12,50
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: '100,01' },
      markupPct: '12,5',
    });
    expect(f2(r.subtotal)).toBe('112.51');
    expect(f2(r.markupTotal)).toBe('12.50');
  });

  it('meio centavo exato sobe', () => {
    // 0,01 × 1,5 = 0,015 → 0,02
    const r = calcularSpot({ modal: 'RODOVIARIO', custos: { RODOVIARIO: '0,01' }, markupPct: 50 });
    expect(f2(r.subtotal)).toBe('0.02');
  });

  it('total calculado sem arredondar o subtotal antes', () => {
    // 3 componentes de 0,01 com markup 50%: cada 0,015 → 0,02 na exibição,
    // mas o subtotal oficial é 0,045 → 0,05 (e não 0,06).
    const r = calcularSpot({
      modal: 'AEREO',
      custos: { COLETA: '0,01', AEREO: '0,01', ENTREGA: '0,01' },
      markupPct: 50,
    });
    expect(r.componentes.map((c) => f2(c.comMarkup))).toEqual(['0.02', '0.02', '0.02']);
    expect(f2(r.subtotal)).toBe('0.05');
    expect(f2(r.total)).toBe('0.05');
  });

  it('valores grandes sem perda de precisão', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: '999999999999.99' },
      markupPct: '33,3333',
      pedagio: '0,01',
    });
    expect(f2(r.subtotal)).toBe('1333332999999.99');
    expect(f2(r.total)).toBe('1333333000000.00');
  });

  it('padrões de ad valorem configurados', () => {
    const r = calcularSpot({
      modal: 'RODOVIARIO',
      custos: { RODOVIARIO: 1 },
      padroesAdValorem: { AEREO: '1', RODOVIARIO: '0.2' },
      valorMercadoria: '1000',
    });
    expect(r.adValorem.pct.toString()).toBe('0.2');
    expect(f2(r.adValorem.estimativa!)).toBe('2.00');
    expect(f2(r.total)).toBe('1.00');
  });
});
