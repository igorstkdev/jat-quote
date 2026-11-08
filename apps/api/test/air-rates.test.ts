import { hojeIso } from '@jat/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CABECALHO_CSV_TARIFAS } from '../src/lib/air-rates.js';
import {
  criarAppTeste,
  criarDbTeste,
  criarUsuario,
  limparBanco,
  login,
  req,
  type App,
} from './helpers.js';

const db = criarDbTeste();
let app: App;
let admin: string;
let oper: string;
let tarifador: string;

beforeAll(async () => {
  app = await criarAppTeste(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await limparBanco(db);
  await criarUsuario(db, 'chefe', { role: 'ADMIN' });
  await criarUsuario(db, 'oper');
  await criarUsuario(db, 'tarifador', { canEditRates: true });
  admin = await login(app, 'chefe');
  oper = await login(app, 'oper');
  tarifador = await login(app, 'tarifador');
});

const tarifa = (extra: object = {}) => ({
  origin: 'gru',
  destination: 'SSA',
  airline: 'GOL',
  validFrom: '01/01/2026',
  validTo: '',
  levels: {
    URGENTE: { perKg: '12,50', min: '150' },
    RAPIDO: { perKg: '9.8', min: '120,00' },
    ECONOMICO: null,
  },
  notes: 'Tabela 2026',
  ...extra,
});

const criar = (cookie: string, payload: object) =>
  req(app, cookie, { method: 'POST', url: '/api/air-rates', payload });

describe('tarifas aéreas: cadastro', () => {
  it('cria normalizada (IATA, vírgula, vigência sem fim), versão 1 e histórico', async () => {
    const res = await criar(tarifador, tarifa());
    expect(res.statusCode).toBe(201);
    const r = res.json().rate;
    expect(r).toMatchObject({
      origin: 'GRU',
      destination: 'SSA',
      airline: 'GOL',
      validFrom: '2026-01-01',
      validTo: null,
      active: true,
      version: 1,
      current: true,
      levels: {
        URGENTE: { perKg: '12.5', min: '150.00' },
        RAPIDO: { perKg: '9.8', min: '120.00' },
        ECONOMICO: null,
      },
      notes: 'Tabela 2026',
    });
    const h = await db.airRateHistory.findMany({ where: { airRateId: r.id } });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ version: 1, action: 'CRIAR', username: 'tarifador' });
    const log = await db.auditLog.findFirst({ where: { entity: 'tarifa_aerea' } });
    expect(log?.action).toBe('CRIAR');
  });

  it('permissão: Operacional só consulta; Admin e "Pode editar tarifas" alteram', async () => {
    expect((await criar(oper, tarifa())).statusCode).toBe(403);
    expect((await criar(admin, tarifa())).statusCode).toBe(201);
    const lista = await req(app, oper, { method: 'GET', url: '/api/air-rates' });
    expect(lista.json().rates).toHaveLength(1);
    expect(lista.json().today).toBe(hojeIso());
  });

  it('validações em português', async () => {
    const msg = async (extra: object) => (await criar(tarifador, tarifa(extra))).json();
    expect((await msg({ origin: 'GR1' })).message).toBe(
      'Origem: informe o código IATA com 3 letras (ex.: GRU).',
    );
    expect((await msg({ destination: 'GRU' })).message).toBe(
      'Origem e destino precisam ser diferentes.',
    );
    expect((await msg({ validFrom: '' })).message).toBe('Informe o início da vigência.');
    expect((await msg({ validTo: '31/12/2025' })).message).toBe(
      'O fim da vigência não pode ser antes do início.',
    );
    expect((await msg({ levels: {} })).message).toBe(
      'Preencha ao menos um nível (Urgente, Rápido ou Econômico).',
    );
    const meio = await msg({ levels: { URGENTE: { perKg: '10', min: '' } } });
    expect(meio).toMatchObject({
      message: 'Urgente: informe a tarifa/kg e o mínimo (ou deixe os dois em branco).',
      campo: 'levels.URGENTE.min',
    });
    expect((await msg({ levels: { RAPIDO: { perKg: '-1', min: '0' } } })).message).toContain(
      'negativ',
    );
    expect((await msg({ airline: 'TAM' })).message).toBe('Escolha a companhia.');
  });

  it('vigências sobrepostas da mesma rota + companhia são proibidas (entre ativas)', async () => {
    await criar(tarifador, tarifa({ validTo: '30/06/2026' }));
    const sobrep = await criar(tarifador, tarifa({ validFrom: '30/06/2026' }));
    expect(sobrep.statusCode).toBe(409);
    expect(sobrep.json().message).toContain('Já existe uma tarifa ativa GOL GRU → SSA');
    // dia seguinte: ok
    expect((await criar(tarifador, tarifa({ validFrom: '01/07/2026' }))).statusCode).toBe(201);
    // outra companhia ou rota: ok
    expect((await criar(tarifador, tarifa({ airline: 'AZUL' }))).statusCode).toBe(201);
    expect((await criar(tarifador, tarifa({ destination: 'REC' }))).statusCode).toBe(201);
    // inativa não conflita, mas não pode ser ativada enquanto sobrepor
    const inativa = await criar(tarifador, tarifa({ active: false }));
    expect(inativa.statusCode).toBe(201);
    const ativar = await req(app, tarifador, {
      method: 'POST',
      url: `/api/air-rates/${inativa.json().rate.id}/status`,
      payload: { active: true },
    });
    expect(ativar.statusCode).toBe(409);
  });

  it('editar gera nova versão e histórico; sem mudança não gera versão', async () => {
    const id = (await criar(tarifador, tarifa())).json().rate.id;
    const igual = await req(app, tarifador, {
      method: 'PUT',
      url: `/api/air-rates/${id}`,
      payload: tarifa(),
    });
    expect(igual.json().rate.version).toBe(1);
    const res = await req(app, tarifador, {
      method: 'PUT',
      url: `/api/air-rates/${id}`,
      payload: tarifa({ levels: { URGENTE: { perKg: '13', min: '150' } } }),
    });
    expect(res.json().rate).toMatchObject({ version: 2, levels: { RAPIDO: null } });
    const hist = await req(app, oper, { method: 'GET', url: `/api/air-rates/${id}/history` });
    const h = hist.json().history;
    expect(h.map((x: { version: number }) => x.version)).toEqual([2, 1]);
    expect(h[1].snapshot.levels.URGENTE.perKg).toBe('12.5');
    const log = await db.auditLog.findFirst({
      where: { entity: 'tarifa_aerea', action: 'EDITAR' },
    });
    expect(log?.details).toMatchObject({
      versao: 2,
      'URGENTE.perKg': { de: '12.5', para: '13' },
      'RAPIDO.min': { de: '120.00', para: null },
    });
  });

  it('desativar tira da calculadora; "Excluir Tudo" arquiva (somente Admin, com frase)', async () => {
    const id = (await criar(tarifador, tarifa())).json().rate.id;
    const off = await req(app, tarifador, {
      method: 'POST',
      url: `/api/air-rates/${id}/status`,
      payload: { active: false },
    });
    expect(off.json().rate).toMatchObject({ active: false, current: false, version: 1 });

    const negado = await req(app, tarifador, {
      method: 'POST',
      url: '/api/air-rates/archive-all',
      payload: { confirmation: 'EXCLUIR TUDO' },
    });
    expect(negado.statusCode).toBe(403);
    const frase = await req(app, admin, {
      method: 'POST',
      url: '/api/air-rates/archive-all',
      payload: { confirmation: 'sim' },
    });
    expect(frase.json().message).toBe('Digite EXCLUIR TUDO para confirmar.');
    const ok = await req(app, admin, {
      method: 'POST',
      url: '/api/air-rates/archive-all',
      payload: { confirmation: 'excluir tudo' },
    });
    expect(ok.json().archived).toBe(1);
    expect((await req(app, oper, { method: 'GET', url: '/api/air-rates' })).json().rates).toEqual(
      [],
    );
    // histórico continua no banco
    expect(await db.airRateHistory.count({ where: { airRateId: id } })).toBe(2);
    expect(await db.airRate.count()).toBe(1);
  });
});

describe('calculadora rápida', () => {
  const cotar = (q: string) => req(app, oper, { method: 'GET', url: `/api/air-rates/quote?${q}` });

  it('lista as companhias vigentes hoje, do menor para o maior custo, com mínimo', async () => {
    await criar(admin, tarifa());
    await criar(
      admin,
      tarifa({ airline: 'AZUL', levels: { URGENTE: { perKg: '10', min: '300' } } }),
    );
    await criar(
      admin,
      tarifa({ airline: 'LATAM', levels: { URGENTE: { perKg: '11', min: '100' } } }),
    );
    // vencida e futura: fora
    await criar(admin, tarifa({ validFrom: '01/01/2020', validTo: '31/12/2020' }));
    await criar(admin, tarifa({ airline: 'AZUL', validFrom: '01/01/2099' }));

    const res = await cotar('origin=gru&destination=ssa&level=URGENTE&weight=20,5');
    const o = res.json().options;
    // GOL 20,5 × 12,5 = 256,25 ; AZUL 205 < 300 → 300 ; LATAM 225,50
    expect(
      o.map((x: { airline: string; value: string; minimumApplied: boolean }) => [
        x.airline,
        x.value,
        x.minimumApplied,
      ]),
    ).toEqual([
      ['LATAM', '225.50', false],
      ['GOL', '256.25', false],
      ['AZUL', '300.00', true],
    ]);
    expect(
      (await cotar('origin=GRU&destination=SSA&level=ECONOMICO&weight=10')).json().options,
    ).toEqual([]);
    expect((await cotar('origin=GRU&destination=SSA&level=URGENTE&weight=0')).statusCode).toBe(400);
    const aero = await req(app, oper, { method: 'GET', url: '/api/air-rates/airports' });
    expect(aero.json().routes).toEqual([['GRU', 'SSA']]);
  });
});

describe('CSV', () => {
  const cab = CABECALHO_CSV_TARIFAS.join(';');
  const importar = (csv: string, confirm: boolean, cookie = tarifador) =>
    req(app, cookie, { method: 'POST', url: '/api/air-rates/import', payload: { csv, confirm } });

  it('exporta no layout do app atual e reimporta sem alterações', async () => {
    await criar(admin, tarifa({ notes: 'tem; ponto e vírgula' }));
    const exp = await req(app, oper, { method: 'GET', url: '/api/air-rates/export' });
    expect(exp.headers['content-type']).toContain('text/csv');
    const linhas = exp.body.replace('﻿', '').split('\r\n');
    expect(linhas[0]).toBe(cab);
    expect(linhas[1]).toBe(
      'GRU;SSA;GOL;12,50;150,00;9,80;120,00;;;Ativa;1;01/01/2026;;"tem; ponto e vírgula"',
    );
    const re = await importar(exp.body, true);
    expect(re.json()).toMatchObject({
      applied: true,
      summary: { total: 1, criar: 0, atualizar: 0, igual: 1, erros: 0 },
    });
  });

  it('prévia mostra erros por linha e não grava nada; confirma cria e atualiza', async () => {
    const existente = (await criar(admin, tarifa())).json().rate.id;
    const csv = [
      cab,
      'GRU;SSA;GOL;13,00;150;;;;;Ativa;1;01/01/2026;;atualizada',
      'CGH;REC;azul;;;8,5;90;;;;;10/02/2026;;',
      'CGH;REC;AZUL;;;8,5;90;;;;;10/02/2026;;',
      'XX;REC;GOL;1;1;;;;;;;01/01/2026;;',
      'BSB;POA;TAM;1;1;;;;;;;01/01/2026;;',
    ].join('\n');
    const previa = await importar(csv, false);
    expect(previa.json().applied).toBe(false);
    expect(previa.json().summary).toEqual({ total: 5, criar: 1, atualizar: 1, igual: 0, erros: 3 });
    const erros = previa.json().rows.filter((r: { acao: string }) => r.acao === 'erro');
    expect(erros.map((r: { linha: number; erro: string }) => [r.linha, r.erro])).toEqual([
      [4, 'Linha repetida no arquivo (igual à linha 3).'],
      [5, 'Origem: informe o código IATA com 3 letras (ex.: GRU).'],
      [6, 'Companhia "TAM" inválida: use GOL, AZUL ou LATAM.'],
    ]);
    // com erro, confirmar não grava
    expect((await importar(csv, true)).json().applied).toBe(false);
    expect(await db.airRate.count()).toBe(1);

    const bom = csv.split('\n').slice(0, 3).join('\n');
    const ok = await importar(bom, true);
    expect(ok.json()).toMatchObject({ applied: true, summary: { criar: 1, atualizar: 1 } });
    const atual = await db.airRate.findUnique({ where: { id: existente } });
    expect(atual).toMatchObject({ version: 2, notes: 'atualizada' });
    expect(atual?.fastPerKg).toBeNull();
    expect(await db.auditLog.count({ where: { action: 'IMPORTAR' } })).toBe(1);
  });

  it('recusa arquivo fora do formato e sobreposição dentro do arquivo', async () => {
    const r = await importar('Origem;Destino\nGRU;SSA', false);
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain('Colunas ausentes: Companhia');
    const sobrep = await importar(
      [cab, 'GRU;SSA;GOL;1;1;;;;;;;01/01/2026;;', 'GRU;SSA;GOL;1;1;;;;;;;01/03/2026;;'].join('\n'),
      false,
    );
    expect(sobrep.json().rows[1].erro).toContain('Já existe uma tarifa ativa GOL GRU → SSA');
    expect((await importar(cab, false, oper)).statusCode).toBe(403);
  });
});
