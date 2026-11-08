import { describe, expect, it } from 'vitest';
import { assuntoCotacaoFtl, destinoFtl, linkEmailCotacaoFtl, textoCotacaoFtl } from './cotacao.js';

describe('texto da cotação FTL', () => {
  const base = {
    numero: 7,
    uf: 'SP',
    regiao: 'Sudeste',
    localidade: 'CAPITAL' as const,
    veiculo: 'VAN',
    distanciaKm: '300',
    tarifaKm: '3.6',
    total: '1080',
    adValoremPct: '0.5',
    data: new Date('2026-11-08T15:00:00Z'),
    condicoes: '  PRAZO DE VALIDADE 15 DIAS.  ',
    observacoes: ' Coleta às 8h ',
  };

  it('texto completo, com destaque para WhatsApp', () => {
    expect(textoCotacaoFtl(base, { whatsapp: true })).toBe(
      [
        '*COTAÇÃO FTL FIAT JQ-000007*',
        'JAT Transportes e Logística',
        '',
        'Destino: SP — Capital (Sudeste)',
        'Veículo: VAN',
        'KM da rota: 300 km',
        'Tarifa por km: R$ 3,60',
        'Data: 08/11/2026',
        '',
        '*Valor do frete: R$ 1.080,00*',
        '',
        'Ad valorem de 0,50% sobre o valor da nota fiscal, cobrado adicionalmente.',
        '',
        '*Condições comerciais:*',
        'PRAZO DE VALIDADE 15 DIAS.',
        '',
        'Observações: Coleta às 8h',
      ].join('\n'),
    );
  });

  it('sem número, sem condições, sem observações, região vazia, km fracionado', () => {
    const t = textoCotacaoFtl({
      ...base,
      numero: null,
      regiao: ' ',
      localidade: 'INTERIOR',
      distanciaKm: '120.5',
      condicoes: '',
      observacoes: null,
    });
    expect(t.split('\n')[0]).toBe('COTAÇÃO FTL FIAT');
    expect(t).toContain('Destino: SP — Interior\n');
    expect(t).toContain('KM da rota: 120,5 km');
    expect(t).not.toContain('Condições');
    expect(t).not.toContain('Observações');
  });

  it('assunto e mailto', () => {
    expect(assuntoCotacaoFtl(base)).toBe('Cotação FTL Fiat JQ-000007 — SP — Capital (Sudeste)');
    expect(assuntoCotacaoFtl({ ...base, numero: undefined })).toBe(
      'Cotação FTL Fiat — SP — Capital (Sudeste)',
    );
    expect(destinoFtl(base)).toBe('SP — Capital (Sudeste)');
    const link = linkEmailCotacaoFtl(base);
    expect(link.startsWith('mailto:?subject=Cota%C3%A7%C3%A3o%20FTL')).toBe(true);
    expect(decodeURIComponent(link.split('&body=')[1]!)).toBe(textoCotacaoFtl(base));
  });
});
