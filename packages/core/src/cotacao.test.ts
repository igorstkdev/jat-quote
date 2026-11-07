import { describe, expect, it } from 'vitest';
import {
  assuntoCotacao,
  dataValidade,
  formatarDataBR,
  formatarNumeroCotacao,
  linkEmailCotacao,
  ROTULO_MODAL,
  textoCotacao,
  VALIDADE_COTACAO_DIAS,
  type DadosTextoCotacao,
} from './cotacao.js';

const base: DadosTextoCotacao = {
  numero: 123,
  cliente: 'Fiat Automóveis S.A.',
  origem: 'São Paulo, SP',
  destino: 'Feira de Santana, BA',
  modal: 'AEREO',
  data: new Date('2026-11-07T14:54:00Z'),
  total: '1935',
  adValoremPct: '0.47',
};

describe('cotação: número, datas e validade', () => {
  it('número JQ-000123', () => {
    expect(formatarNumeroCotacao(123)).toBe('JQ-000123');
    expect(formatarNumeroCotacao(1234567)).toBe('JQ-1234567');
  });
  it('data no fuso de São Paulo e validade de 30 dias', () => {
    expect(VALIDADE_COTACAO_DIAS).toBe(30);
    expect(formatarDataBR(new Date('2026-11-08T02:00:00Z'))).toBe('07/11/2026');
    expect(formatarDataBR(dataValidade(base.data))).toBe('07/12/2026');
    expect(ROTULO_MODAL.FTL).toBe('FTL Fiat');
  });
});

describe('texto da cotação (Copiar / e-mail) — visão do cliente', () => {
  it('formato com negrito do WhatsApp e sem custos internos', () => {
    const t = textoCotacao(base, { whatsapp: true });
    expect(t).toBe(
      [
        '*COTAÇÃO DE FRETE JQ-000123*',
        'JAT Transportes e Logística',
        '',
        'Cliente: Fiat Automóveis S.A.',
        'Origem: São Paulo, SP',
        'Destino: Feira de Santana, BA',
        'Modal: Aéreo',
        'Data: 07/11/2026',
        '',
        '*Valor do frete: R$ 1.935,00*',
        '',
        'Condições:',
        '• Ad valorem de 0,47% sobre o valor da nota fiscal, cobrado adicionalmente.',
        '• Validade: 30 dias (até 07/12/2026).',
      ].join('\n'),
    );
    expect(t).not.toMatch(/MKUP|markup|custo/i);
  });

  it('sem número (rascunho), sem negrito e com observações', () => {
    const t = textoCotacao({
      ...base,
      numero: null,
      modal: 'RODOVIARIO',
      observacoes: '  Coleta até 17h. ',
      validadeDias: 15,
    });
    expect(t.startsWith('COTAÇÃO DE FRETE\n')).toBe(true);
    expect(t).toContain('Modal: Rodoviário');
    expect(t).toContain('• Validade: 15 dias (até 22/11/2026).');
    expect(t.endsWith('\n\nObservações: Coleta até 17h.')).toBe(true);
    expect(textoCotacao({ ...base, observacoes: '   ' })).not.toContain('Observações');
  });

  it('assunto e link mailto', () => {
    expect(assuntoCotacao(base)).toBe(
      'Cotação de frete JQ-000123 — São Paulo, SP → Feira de Santana, BA',
    );
    expect(assuntoCotacao({ ...base, numero: null })).toBe(
      'Cotação de frete — São Paulo, SP → Feira de Santana, BA',
    );
    const link = linkEmailCotacao(base, 'logistica@fiat.com.br');
    expect(
      link.startsWith('mailto:logistica%40fiat.com.br?subject=Cota%C3%A7%C3%A3o%20de%20frete'),
    ).toBe(true);
    expect(link).not.toContain('+');
    expect(decodeURIComponent(link.split('body=')[1]!)).toContain('Valor do frete: R$ 1.935,00');
    expect(linkEmailCotacao(base).startsWith('mailto:?subject=')).toBe(true);
  });
});
