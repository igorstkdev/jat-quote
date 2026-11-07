import { describe, expect, it } from 'vitest';
import {
  buscarMunicipios,
  ehUf,
  encontrarMunicipio,
  formatarCidade,
  listarMunicipios,
  normalizarTexto,
  SIGLAS_UF,
  UFS,
} from './municipios.js';

describe('municípios (IBGE)', () => {
  it('lista oficial completa e 27 UFs', () => {
    expect(listarMunicipios().length).toBeGreaterThan(5560);
    expect(SIGLAS_UF).toHaveLength(27);
    expect(UFS.BA).toBe('Bahia');
    // todo município pertence a uma UF válida
    expect(listarMunicipios().every((m) => ehUf(m.uf))).toBe(true);
  });

  it('normaliza acentos, maiúsculas, apóstrofos e hífens', () => {
    expect(normalizarTexto('  São  Paulo ')).toBe('sao paulo');
    expect(normalizarTexto("Alta Floresta D'Oeste")).toBe('alta floresta d oeste');
    expect(normalizarTexto('Embu-Guaçu')).toBe('embu guacu');
  });

  it('padroniza a grafia: "Feira De Santana" → "Feira de Santana, BA"', () => {
    const m = encontrarMunicipio('feira DE santana', 'ba');
    expect(m).toMatchObject({ nome: 'Feira de Santana', uf: 'BA', codigo: 2910800 });
    expect(formatarCidade(m!)).toBe('Feira de Santana, BA');
    expect(encontrarMunicipio('Sao Paulo', 'SP')?.nome).toBe('São Paulo');
    expect(encontrarMunicipio('Feira de Santana', 'SP')).toBeNull();
  });

  it('busca: começa com o termo antes de contém; nomes curtos primeiro', () => {
    const r = buscarMunicipios('sao paulo');
    expect(formatarCidade(r[0]!)).toBe('São Paulo, SP');
    expect(r.length).toBeLessThanOrEqual(10);
    const contem = buscarMunicipios('santana', { limite: 50 });
    const iComeca = contem.findIndex((m) => m.nome.startsWith('Santana'));
    const iContem = contem.findIndex((m) => !normalizarTexto(m.nome).startsWith('santana'));
    expect(iComeca).toBeLessThan(iContem);
  });

  it('busca com UF no termo ("feira ba", "feira, ba") ou por filtro', () => {
    expect(buscarMunicipios('feira ba').every((m) => m.uf === 'BA')).toBe(true);
    expect(buscarMunicipios('feira, ba')[0]?.nome).toBe('Feira da Mata');
    expect(buscarMunicipios('campinas', { uf: 'sp' }).map(formatarCidade)).toContain(
      'Campinas, SP',
    );
    // "xx" não é UF: vira parte do termo
    expect(buscarMunicipios('sao xx')).toEqual([]);
  });

  it('termo vazio não lista nada; limite respeitado', () => {
    expect(buscarMunicipios('   ')).toEqual([]);
    expect(buscarMunicipios('a', { limite: 3 })).toHaveLength(3);
  });

  it('ehUf', () => {
    expect(ehUf('sp')).toBe(true);
    expect(ehUf('XX')).toBe(false);
  });
});
