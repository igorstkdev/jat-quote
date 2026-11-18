import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CABECALHO_CSV_FTL } from '../src/lib/ftl.js';
import { dadosPdfFtl } from '../src/lib/pdf.js';
import { termosGravados } from '../src/lib/quotes.js';
import { htmlCotacaoFtl } from '../src/lib/pdf-templates.js';
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

const tabelaSP = (extra: object = {}) => ({
  uf: 'sp',
  region: 'Sudeste',
  locality: 'CAPITAL',
  perKm: { UTILITARIO: '2,90', VAN: '3,60', TRES_QUARTOS: '4.5' },
  adValoremPct: '0,5',
  ...extra,
});
const criarTabela = (cookie: string, payload: object) =>
  req(app, cookie, { method: 'POST', url: '/api/ftl/rates', payload });
const cotar = (cookie: string, payload: object) =>
  req(app, cookie, { method: 'POST', url: '/api/ftl/quotes', payload });

describe('FTL: tabelas de preço', () => {
  it('cria, edita com versão/histórico e exige permissão', async () => {
    expect((await criarTabela(oper, tabelaSP())).statusCode).toBe(403);
    const res = await criarTabela(tarifador, tabelaSP());
    expect(res.statusCode).toBe(201);
    const t = res.json().rate;
    expect(t).toMatchObject({
      uf: 'SP',
      locality: 'CAPITAL',
      perKm: { UTILITARIO: '2.9', VAN: '3.6', TRES_QUARTOS: '4.5' },
      adValoremPct: '0.5',
      version: 1,
    });
    const ed = await req(app, tarifador, {
      method: 'PUT',
      url: `/api/ftl/rates/${t.id}`,
      payload: tabelaSP({ perKm: { UTILITARIO: '2,90', VAN: '3,80', TRES_QUARTOS: '4.5' } }),
    });
    expect(ed.json().rate).toMatchObject({ version: 2, perKm: { VAN: '3.8' } });
    const h = await req(app, oper, { method: 'GET', url: `/api/ftl/rates/${t.id}/history` });
    expect(h.json().history).toHaveLength(2);
  });

  it('validações e uma tabela ativa por UF + tipo', async () => {
    const msg = async (extra: object) => (await criarTabela(admin, tabelaSP(extra))).json();
    expect((await msg({ uf: 'XX' })).message).toBe('Escolha uma UF válida.');
    expect((await msg({ region: '' })).message).toBe('Informe a região.');
    expect((await msg({ perKm: { UTILITARIO: '1', VAN: '' } })).message).toBe(
      'VAN: R$/km: informe o valor.',
    );
    expect((await msg({ adValoremPct: '101' })).message).toContain('100');

    await criarTabela(admin, tabelaSP());
    const dup = await criarTabela(admin, tabelaSP());
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toBe(
      'Já existe uma tabela ativa para SP Capital. Edite a existente ou desative-a antes.',
    );
    expect((await criarTabela(admin, tabelaSP({ locality: 'INTERIOR' }))).statusCode).toBe(201);
    expect((await criarTabela(admin, tabelaSP({ active: false }))).statusCode).toBe(201);
  });

  it('CSV: exporta, importa com prévia e "Excluir Tudo" arquiva', async () => {
    await criarTabela(admin, tabelaSP());
    const exp = await req(app, oper, { method: 'GET', url: '/api/ftl/rates/export' });
    const linhas = exp.body.replace('﻿', '').split('\r\n');
    expect(linhas[0]).toBe(CABECALHO_CSV_FTL.join(';'));
    expect(linhas[1]).toBe('SP;Sudeste;Capital;2,90;3,60;4,50;0,50;Ativa;1;');

    const csv = [
      CABECALHO_CSV_FTL.join(';'),
      'SP;Sudeste;Capital;2,90;3,70;4,50;0,50;Ativa;1;',
      'BA;Nordeste;interior;3;4;5;0,15;;;',
      'RJ;Sudeste;Metrópole;3;4;5;0,15;;;',
    ].join('\n');
    const previa = await req(app, tarifador, {
      method: 'POST',
      url: '/api/ftl/rates/import',
      payload: { csv },
    });
    expect(previa.json().summary).toEqual({ total: 3, criar: 1, atualizar: 1, igual: 0, erros: 1 });
    expect(previa.json().rows[2].erro).toBe('Tipo "Metrópole" inválido: use Capital ou Interior.');
    const ok = await req(app, tarifador, {
      method: 'POST',
      url: '/api/ftl/rates/import',
      payload: { csv: csv.split('\n').slice(0, 3).join('\n'), confirm: true },
    });
    expect(ok.json().applied).toBe(true);
    expect(await db.ftlRate.count({ where: { version: 2 } })).toBe(1);

    const arq = await req(app, admin, {
      method: 'POST',
      url: '/api/ftl/rates/archive-all',
      payload: { confirmation: 'EXCLUIR TUDO' },
    });
    expect(arq.json().archived).toBe(2);
    expect((await req(app, oper, { method: 'GET', url: '/api/ftl/rates' })).json().rates).toEqual(
      [],
    );
  });
});

describe('FTL: cotações', () => {
  it('golden: VAN R$ 3,60/km × 300 km = R$ 1.080,00, sem cliente, numerada e Pendente', async () => {
    const t = (await criarTabela(admin, tabelaSP())).json().rate;
    const res = await cotar(oper, {
      uf: 'SP',
      locality: 'CAPITAL',
      vehicle: 'VAN',
      distanceKm: '300',
      notes: 'Coleta às 8h',
      total: '1', // ignorado
    });
    expect(res.statusCode).toBe(201);
    const q = res.json().quote;
    expect(q).toMatchObject({
      code: 'JQ-000001',
      modal: 'FTL',
      status: 'PENDENTE',
      clientId: null,
      clientName: null,
      total: '1080',
      adValoremPct: '0.5',
      markupTotal: '0',
      ftl: {
        uf: 'SP',
        region: 'Sudeste',
        locality: 'CAPITAL',
        vehicle: 'VAN',
        distanceKm: '300',
        ratePerKm: '3.6',
        rateVersion: t.version,
      },
    });
    expect(await db.quoteStatusChange.count({ where: { quoteId: q.id } })).toBe(1);

    // Mesma sequência do Spot; FTL não aparece na lista do Spot
    const spot = await req(app, oper, { method: 'GET', url: '/api/quotes' });
    expect(spot.json().quotes).toEqual([]);
    const lista = await req(app, oper, { method: 'GET', url: '/api/ftl/quotes?search=sp' });
    expect(lista.json().quotes).toHaveLength(1);
    expect(
      (await req(app, oper, { method: 'GET', url: '/api/ftl/quotes?status=APROVADA' })).json()
        .quotes,
    ).toEqual([]);
  });

  it('bloqueia abaixo de 25 km e sem tabela ativa', async () => {
    await criarTabela(admin, tabelaSP());
    const curto = await cotar(oper, {
      uf: 'SP',
      locality: 'CAPITAL',
      vehicle: 'VAN',
      distanceKm: '24,9',
    });
    expect(curto.json()).toMatchObject({
      message: 'KM da rota: mínimo 25 km.',
      campo: 'distanciaKm',
    });
    const sem = await cotar(oper, {
      uf: 'SP',
      locality: 'INTERIOR',
      vehicle: 'VAN',
      distanceKm: '100',
    });
    expect(sem.json().message).toBe(
      'Não há tabela ativa para SP Interior. Cadastre-a na aba Tabelas de Preço.',
    );
  });

  it('status: qualquer um muda de Pendente; sair de Aprovada só Admin; tudo registrado', async () => {
    await criarTabela(admin, tabelaSP());
    const q = (
      await cotar(oper, { uf: 'SP', locality: 'CAPITAL', vehicle: 'VAN', distanceKm: '300' })
    ).json().quote;
    const mudar = (cookie: string, status: string, note?: string) =>
      req(app, cookie, {
        method: 'POST',
        url: `/api/quotes/${q.id}/status`,
        payload: { status, note },
      });
    expect((await mudar(oper, 'PENDENTE')).json().message).toBe(
      'A cotação já está com este status.',
    );
    expect((await mudar(oper, 'APROVADA', 'Fiat aprovou')).json().quote.status).toBe('APROVADA');
    expect((await mudar(oper, 'DECLINADA')).statusCode).toBe(403);
    expect((await mudar(admin, 'PENDENTE')).json().quote.status).toBe('PENDENTE');

    const hist = await req(app, oper, {
      method: 'GET',
      url: `/api/quotes/${q.id}/status-history`,
    });
    expect(
      hist.json().changes.map((c: { from: string | null; to: string }) => [c.from, c.to]),
    ).toEqual([
      ['APROVADA', 'PENDENTE'],
      ['PENDENTE', 'APROVADA'],
      [null, 'PENDENTE'],
    ]);
    expect(hist.json().changes[1]).toMatchObject({ note: 'Fiat aprovou', user: 'OPER' });
    expect(await db.auditLog.count({ where: { action: 'STATUS' } })).toBe(2);

    const editar = await req(app, oper, {
      method: 'PATCH',
      url: `/api/quotes/${q.id}`,
      payload: {},
    });
    expect(editar.statusCode).toBe(400);
  });

  it('PDF da cotação FTL traz as condições comerciais e não traz cliente', async () => {
    await criarTabela(admin, tabelaSP());
    const { id } = (
      await cotar(oper, { uf: 'SP', locality: 'CAPITAL', vehicle: 'VAN', distanceKm: '300' })
    ).json().quote;
    const q = await db.quote.findUniqueOrThrow({ where: { id }, include: { ftlRate: true } });
    const html = htmlCotacaoFtl(dadosPdfFtl(q, 'Fulano', termosGravados(q)));
    expect(html).toContain('Cotação FTL Fiat');
    expect(html).toContain('SP — Capital (Sudeste)');
    expect(html).toContain('R$ 1.080,00');
    expect(html).toContain('R$ 3,60');
    expect(html).toContain('PRAZO DE VALIDADE 15 DIAS.'); // condições da VAN gravadas na cotação
    expect(html).not.toContain('Cliente');
  });
});
