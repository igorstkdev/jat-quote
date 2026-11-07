import { describe, expect, it } from 'vitest';
import {
  calcularCubagem,
  FATOR_CUBAGEM,
  MODO_TAXADO_PADRAO,
  type VolumeEntrada,
} from './cubagem.js';

const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

const grande: VolumeEntrada = {
  comprimentoM: '0,5',
  larguraM: '0,8',
  alturaM: '1,2',
  pesoBrutoKg: 200,
};
const pequeno: VolumeEntrada = {
  comprimentoM: '0,4',
  larguraM: '0,3',
  alturaM: '0,3',
  pesoBrutoKg: 3,
};

describe('calcularCubagem — fatores e padrão', () => {
  it('fatores: aéreo 166,667 e rodoviário 300', () => {
    expect(FATOR_CUBAGEM).toEqual({ AEREO: '166.667', RODOVIARIO: '300' });
    expect(MODO_TAXADO_PADRAO).toBe('POR_VOLUME');
  });

  it('fatores configurados', () => {
    const r = calcularCubagem({
      modal: 'AEREO',
      fatores: { AEREO: 200, RODOVIARIO: 300 },
      volumes: [{ comprimentoM: 1, larguraM: 1, alturaM: 1, pesoBrutoKg: 1 }],
    });
    expect(f2(r.pesoCubadoTotal)).toBe('200.00');
  });

  it('modal desconhecido falha', () => {
    expect(() => calcularCubagem({ modal: 'X' as never, volumes: [grande] })).toThrow(
      'Modal desconhecido',
    );
  });
});

describe('calcularCubagem — dois modos de taxado total', () => {
  it('POR_VOLUME: Σ MAX por linha = 200 + 10,8 = 210,80', () => {
    const r = calcularCubagem({ modal: 'RODOVIARIO', volumes: [grande, pequeno] });
    expect(r.modo).toBe('POR_VOLUME');
    expect(f2(r.pesoBrutoTotal)).toBe('203.00');
    expect(f2(r.pesoCubadoTotal)).toBe('154.80');
    expect(f2(r.pesoTaxadoTotal)).toBe('210.80');
    expect(r.volumes.map((v) => f2(v.pesoTaxado))).toEqual(['200.00', '10.80']);
  });

  it('POR_EMBARQUE: MAX(Σ bruto, Σ cubado) = MAX(203, 154,8) = 203,00', () => {
    const r = calcularCubagem({
      modal: 'RODOVIARIO',
      modo: 'POR_EMBARQUE',
      volumes: [grande, pequeno],
    });
    expect(f2(r.pesoTaxadoTotal)).toBe('203.00');
  });

  it('POR_EMBARQUE quando o cubado domina', () => {
    const r = calcularCubagem({
      modal: 'AEREO',
      modo: 'POR_EMBARQUE',
      volumes: [{ comprimentoM: 1, larguraM: 1, alturaM: 1, pesoBrutoKg: 10 }, pequeno],
    });
    // cubado: 166,667 + 0,036 × 166,667 = 172,667... ; bruto 13
    expect(f2(r.pesoTaxadoTotal)).toBe('172.67');
  });
});

describe('calcularCubagem — quantidade', () => {
  it('quantidade multiplica bruto, cubado e taxado da linha (bruto informado por unidade)', () => {
    const r = calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, quantidade: 3 }] });
    const v = r.volumes[0]!;
    expect(v.quantidade).toBe(3);
    expect(v.volumeM3Unitario.toString()).toBe('0.036');
    expect(f2(v.pesoBruto)).toBe('9.00');
    expect(f2(v.pesoCubado)).toBe('32.40');
    expect(f2(v.pesoTaxado)).toBe('32.40');
    expect(r.quantidadeTotal).toBe(3);
    expect(r.volumeM3Total.toString()).toBe('0.108');
  });

  it('quantidade vazia = 1', () => {
    const r = calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, quantidade: '' }] });
    expect(r.volumes[0]?.quantidade).toBe(1);
  });

  it('quantidade inválida: zero, fracionada ou negativa', () => {
    expect(() =>
      calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, quantidade: 0 }] }),
    ).toThrow('Volume 1: quantidade deve ser maior que zero.');
    expect(() =>
      calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, quantidade: '1,5' }] }),
    ).toThrow('Volume 1: quantidade: use no máximo 0 casas decimais.');
    expect(() =>
      calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, quantidade: -2 }] }),
    ).toThrow('Volume 1: quantidade não pode ser negativo.');
  });
});

describe('calcularCubagem — validação', () => {
  it('sem volumes', () => {
    expect(() => calcularCubagem({ modal: 'AEREO', volumes: [] })).toThrow(
      'Adicione pelo menos um volume.',
    );
  });

  it('dimensões zeradas, vazias ou negativas (mensagem indica o volume)', () => {
    expect(() =>
      calcularCubagem({ modal: 'AEREO', volumes: [grande, { ...pequeno, alturaM: '0' }] }),
    ).toThrow('Volume 2: altura deve ser maior que zero.');
    expect(() =>
      calcularCubagem({ modal: 'AEREO', volumes: [{ ...pequeno, larguraM: '' }] }),
    ).toThrow('Volume 1: largura é obrigatório.');
    expect(() =>
      calcularCubagem({ modal: 'AEREO', volumes: [{ ...pequeno, comprimentoM: '-1' }] }),
    ).toThrow('Volume 1: comprimento não pode ser negativo.');
  });

  it('peso bruto vazio = 0 (taxado = cubado); negativo é erro', () => {
    const r = calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, pesoBrutoKg: '' }] });
    expect(f2(r.pesoTaxadoTotal)).toBe('10.80');
    expect(() =>
      calcularCubagem({ modal: 'RODOVIARIO', volumes: [{ ...pequeno, pesoBrutoKg: -1 }] }),
    ).toThrow('Volume 1: peso bruto não pode ser negativo.');
  });

  it('arredonda só no total (soma de valores não arredondados)', () => {
    // 3 linhas de 0,1 m³ aéreo = 16,6667 cada (→ 16,67), total 50,0001 → 50,00 (não 50,01)
    const v: VolumeEntrada = { comprimentoM: '0,1', larguraM: 1, alturaM: 1, pesoBrutoKg: 0 };
    const r = calcularCubagem({ modal: 'AEREO', volumes: [v, v, v] });
    expect(r.volumes.map((x) => f2(x.pesoCubado))).toEqual(['16.67', '16.67', '16.67']);
    expect(f2(r.pesoCubadoTotal)).toBe('50.00');
  });
});
