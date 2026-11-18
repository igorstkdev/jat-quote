import { describe, expect, it } from 'vitest';
import {
  lerCondicoes,
  normalizarCondicoes,
  temCondicoes,
  textoCondicoes,
  TOPICOS_AEREO_PADRAO,
} from './condicoes.js';

describe('condições (tópicos ou texto livre)', () => {
  it('tópicos viram linhas com marcador, sem vazios', () => {
    const c = {
      formato: 'TOPICOS' as const,
      topicos: ['  ICMS a incluir. ', '', 'Horas  paradas.'],
      texto: 'x',
    };
    expect(textoCondicoes(c)).toBe('• ICMS a incluir.\n• Horas paradas.');
    expect(normalizarCondicoes(c).topicos).toEqual(['ICMS a incluir.', 'Horas paradas.']);
  });

  it('texto livre sai como foi escrito', () => {
    const c = { formato: 'TEXTO' as const, topicos: ['ignorado'], texto: '  Linha 1\nLinha 2 ' };
    expect(textoCondicoes(c)).toBe('Linha 1\nLinha 2');
  });

  it('sem conteúdo no formato escolhido = sem condições', () => {
    expect(temCondicoes({ formato: 'TOPICOS', topicos: [' '], texto: 'algo' })).toBe(false);
    expect(textoCondicoes(null)).toBe('');
  });

  it('lê o formato antigo (string) como texto livre', () => {
    expect(lerCondicoes('Condições antigas')).toEqual({
      formato: 'TEXTO',
      topicos: [],
      texto: 'Condições antigas',
    });
    expect(lerCondicoes(undefined).formato).toBe('TOPICOS');
  });

  it('padrão do aéreo tem os 7 tópicos de referência', () => {
    expect(TOPICOS_AEREO_PADRAO).toHaveLength(7);
  });
});
