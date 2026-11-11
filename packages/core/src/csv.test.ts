import { describe, expect, it } from 'vitest';
import { chaveCabecalho, escreverCsv, lerCsv, lerCsvComLinhas } from './csv.js';

describe('lerCsv', () => {
  it('lê o cabeçalho do app atual com BOM e CRLF', () => {
    const t =
      '﻿Origem;Destino;Companhia;Urgente R$/Kg\r\nGRU;SSA;GOL;12,50\r\n\r\nCGH;REC;AZUL;\r\n';
    expect(lerCsv(t)).toEqual([
      ['Origem', 'Destino', 'Companhia', 'Urgente R$/Kg'],
      ['GRU', 'SSA', 'GOL', '12,50'],
      ['CGH', 'REC', 'AZUL', ''],
    ]);
  });

  it('aspas, separador e quebra de linha dentro do campo; aspas duplicadas', () => {
    const t = 'a;"b;c";"linha 1\nlinha 2";"diz ""oi"""\nx;y;z;w';
    expect(lerCsv(t)).toEqual([
      ['a', 'b;c', 'linha 1\nlinha 2', 'diz "oi"'],
      ['x', 'y', 'z', 'w'],
    ]);
  });

  it('CR sozinho, último campo sem quebra, linha só com separadores é ignorada', () => {
    expect(lerCsv('a;b\r;;\rc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(lerCsv('')).toEqual([]);
    expect(lerCsv('a,b', ',')).toEqual([['a', 'b']]);
    expect(lerCsv('a;')).toEqual([['a', '']]);
  });
});

describe('escreverCsv', () => {
  it('escapa só o necessário e usa CRLF', () => {
    expect(
      escreverCsv([
        ['Origem', 'Obs'],
        ['GRU', 'tem; ponto e vírgula'],
        ['SSA', 'diz "oi"'],
        [null, undefined],
        [1, 'a\nb'],
      ]),
    ).toBe('Origem;Obs\r\nGRU;"tem; ponto e vírgula"\r\nSSA;"diz ""oi"""\r\n;\r\n1;"a\nb"\r\n');
  });

  it('ida e volta', () => {
    const dados = [
      ['x', 'a;b', 'c"d'],
      ['1', '', 'z'],
    ];
    expect(lerCsv(escreverCsv(dados))).toEqual(dados);
  });
});

it('chaveCabecalho ignora acento, caixa e espaços', () => {
  expect(chaveCabecalho('  Vigência   Início ')).toBe('vigencia inicio');
  expect(chaveCabecalho('Econômico R$/Kg')).toBe('economico r$/kg');
});

describe('lerCsvComLinhas: número da linha no arquivo', () => {
  it('conta linhas vazias, CRLF, CR sozinho e quebras dentro de aspas', () => {
    const t = '﻿a;b\r\n\r\n1;2\n;\n"x\r\ny";3\r4;"z\rw"\n5;6';
    expect(lerCsvComLinhas(t)).toEqual([
      { linha: 1, campos: ['a', 'b'] },
      { linha: 3, campos: ['1', '2'] },
      { linha: 5, campos: ['x\r\ny', '3'] },
      { linha: 7, campos: ['4', 'z\rw'] },
      { linha: 9, campos: ['5', '6'] },
    ]);
  });
});
