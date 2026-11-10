import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { dadosDashboard, rotuloRota } from '../src/lib/dashboard.js';
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
let operId: string;

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
  operId = (await criarUsuario(db, 'oper')).id;
  admin = await login(app, 'chefe');
  oper = await login(app, 'oper');
});

type Extra = Partial<Prisma.QuoteUncheckedCreateInput>;

/** Grava uma cotação direto no banco (o cálculo já é coberto pelos testes de cotação). */
async function cotacao(extra: Extra = {}) {
  const q = await db.quote.create({
    data: {
      modal: 'RODOVIARIO',
      status: 'PENDENTE',
      clientName: 'Fiat',
      originCity: 'São Paulo',
      originUf: 'SP',
      destCity: 'Salvador',
      destUf: 'BA',
      costRoad: '350.00',
      toll: '150.00',
      markupPct: '70',
      adValoremPct: '0.15',
      costTotal: '350.00',
      markupTotal: '245.00',
      subtotal: '595.00',
      total: '745.00',
      createdById: operId,
      ...extra,
    },
  });
  await db.quoteStatusChange.create({
    data: {
      quoteId: q.id,
      fromStatus: null,
      toStatus: 'PENDENTE',
      userId: operId,
      at: q.createdAt,
    },
  });
  if (q.status !== 'PENDENTE') {
    await db.quoteStatusChange.create({
      data: {
        quoteId: q.id,
        fromStatus: 'PENDENTE',
        toStatus: q.status,
        userId: operId,
        at: new Date(q.createdAt.getTime() + 60_000),
      },
    });
  }
  return q;
}

const ftl = (extra: Extra = {}) =>
  cotacao({
    modal: 'FTL',
    clientName: null,
    originCity: null,
    originUf: null,
    destCity: null,
    destUf: 'SP',
    ftlLocality: 'CAPITAL',
    vehicle: 'VAN',
    distanceKm: '300',
    ratePerKm: '3.6',
    costRoad: null,
    toll: '0',
    markupPct: '0',
    adValoremPct: '0.5',
    costTotal: '1080.00',
    markupTotal: '0',
    subtotal: '1080.00',
    total: '1080.00',
    ...extra,
  });

const relatorio = (cookie: string, query: Record<string, string> = {}) =>
  req(app, cookie, {
    method: 'GET',
    url: `/api/reports/spot?${new URLSearchParams(query).toString()}`,
  });

describe('Relatório Spot: filtros e estatísticas', () => {
  beforeEach(async () => {
    await cotacao({ clientName: 'Fiat Automóveis', createdAt: new Date('2026-10-05T15:00:00Z') });
    await cotacao({
      modal: 'AEREO',
      status: 'APROVADA',
      clientName: 'Bosch',
      originCity: 'Campinas',
      destCity: 'Recife',
      destUf: 'PE',
      costRoad: null,
      costPickup: '300.00',
      costAir: '600.00',
      costDelivery: '150.00',
      costTotal: '1050.00',
      markupTotal: '735.00',
      subtotal: '1785.00',
      total: '1935.00',
      adValoremPct: '0.47',
      // 31/10 às 23h em São Paulo = 01/11 02h UTC: conta em OUTUBRO
      createdAt: new Date('2026-11-01T02:00:00Z'),
    });
    await cotacao({
      status: 'DECLINADA',
      clientName: 'Magazine',
      total: '100.10',
      createdAt: new Date('2026-11-03T12:00:00Z'),
    });
    await cotacao({ status: 'RECUSADA', clientName: 'Bosch', total: '0.20' });
    await ftl(); // FTL não entra no Relatório Spot
    await cotacao({ clientName: 'Excluída', deletedAt: new Date() });
  });

  it('sem filtro: só Spot não excluídas, com quantidade e valor por status (somas exatas)', async () => {
    const res = await relatorio(oper);
    expect(res.statusCode).toBe(200);
    const { quotes, stats } = res.json();
    expect(quotes).toHaveLength(4);
    expect(quotes.every((q: { modal: string }) => q.modal !== 'FTL')).toBe(true);
    expect(stats.count).toBe(4);
    expect(stats.value).toBe('2780.30'); // 745 + 1935 + 100,10 + 0,20
    expect(stats.byStatus).toEqual([
      { status: 'PENDENTE', count: 1, value: '745.00' },
      { status: 'APROVADA', count: 1, value: '1935.00' },
      { status: 'DECLINADA', count: 1, value: '100.10' },
      { status: 'RECUSADA', count: 1, value: '0.20' },
    ]);
  });

  it('texto: cliente, cidade e número (com ou sem "JQ-")', async () => {
    const nomes = async (search: string) =>
      (await relatorio(oper, { search }))
        .json()
        .quotes.map((q: { clientName: string }) => q.clientName);
    expect((await nomes('bosch')).sort()).toEqual(['Bosch', 'Bosch']);
    expect(await nomes('recife')).toEqual(['Bosch']);
    expect(await nomes('campinas')).toEqual(['Bosch']);
    expect(await nomes('JQ-000001')).toEqual(['Fiat Automóveis']);
    expect(await nomes('3')).toEqual(['Magazine']);
  });

  it('período no fuso de São Paulo, status e modal combinados', async () => {
    const outubro = (await relatorio(oper, { from: '2026-10-01', to: '2026-10-31' })).json();
    expect(outubro.stats.count).toBe(2);
    const novembro = (await relatorio(oper, { from: '2026-11-01', to: '2026-11-30' })).json();
    expect(novembro.quotes.map((q: { clientName: string }) => q.clientName)).not.toContain(
      'Fiat Automóveis',
    );
    expect(novembro.quotes.map((q: { modal: string }) => q.modal)).not.toContain('AEREO');

    const aprovAereo = (await relatorio(oper, { status: 'APROVADA', modal: 'AEREO' })).json();
    expect(aprovAereo.stats.count).toBe(1);
    expect(
      (await relatorio(oper, { status: 'APROVADA', modal: 'RODOVIARIO' })).json().stats.count,
    ).toBe(0);
  });

  it('paginação e ordenação', async () => {
    const p1 = (await relatorio(oper, { sort: 'total', dir: 'asc', pageSize: '3' })).json();
    expect(p1.quotes.map((q: { total: string }) => q.total)).toEqual(['0.2', '100.1', '745']);
    expect(p1.stats.count).toBe(4); // estatística é do conjunto, não da página
    const p2 = (
      await relatorio(oper, { sort: 'total', dir: 'asc', pageSize: '3', page: '2' })
    ).json();
    expect(p2.quotes.map((q: { total: string }) => q.total)).toEqual(['1935']);
  });

  it('filtro inválido → 400 em português', async () => {
    const res = await relatorio(oper, { status: 'QUALQUER' });
    expect(res.statusCode).toBe(400);
    expect((await relatorio(oper, { from: '01/11/2026' })).json().message).toBe('Data inválida.');
  });

  it('exige login', async () => {
    expect((await relatorio('')).statusCode).toBe(401);
  });
});

describe('Relatório Spot: Excel', () => {
  it('planilha com cabeçalho formatado, valores numéricos, linha de totais, resumo e auditoria', async () => {
    await cotacao({ clientName: 'Fiat', notes: 'Coleta até 17h.' });
    await cotacao({
      status: 'APROVADA',
      clientName: 'Bosch',
      total: '1935.00',
      subtotal: '1785.00',
    });
    await ftl();

    const res = await req(app, oper, { method: 'GET', url: '/api/reports/spot/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="cotacoes-spot-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Cotações')!;
    const cab = ws.getRow(1);
    expect(cab.getCell(1).value).toBe('Nº');
    expect(cab.getCell(13).value).toBe('Total do frete');
    expect(cab.getCell(1).font?.bold).toBe(true);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    expect(ws.rowCount).toBe(4); // cabeçalho + 2 cotações Spot + totais (FTL fora)
    const linha = ws.getRow(2); // mais recente primeiro
    expect(linha.getCell(1).value).toBe('JQ-000002');
    expect(linha.getCell(3).value).toBe('Bosch');
    expect(linha.getCell(7).value).toBe('Aprovada');
    expect(linha.getCell(13).value).toBe(1935);
    expect(linha.getCell(13).numFmt).toContain('#,##0.00');
    expect(ws.getRow(3).getCell(16).value).toBe('Coleta até 17h.');

    const totais = ws.getRow(4);
    expect(totais.getCell(1).value).toBe('Total');
    expect(totais.getCell(13).value).toEqual({ formula: 'SUM(M2:M3)', result: 2680 });

    const resumo = wb.getWorksheet('Resumo')!;
    const textos = resumo
      .getSheetValues()
      .flat()
      .filter((v) => typeof v === 'string');
    expect(textos).toContain('Aéreo e Rodoviário');
    expect(textos).toContain('Aprovada');

    const log = await db.auditLog.findFirst({ where: { action: 'EXPORTAR' } });
    expect(log?.username).toBe('oper');
  });

  it('respeita os filtros', async () => {
    await cotacao({ clientName: 'Fiat' });
    await cotacao({ clientName: 'Bosch', status: 'APROVADA' });
    const res = await req(app, oper, {
      method: 'GET',
      url: '/api/reports/spot/export?status=APROVADA',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Cotações')!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(3).value).toBe('Bosch');
  });

  it('sem cotações: só o cabeçalho', async () => {
    const res = await req(app, oper, { method: 'GET', url: '/api/reports/spot/export' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Cotações')!.rowCount).toBe(1);
  });
});

describe('excluir cotação (somente Admin, soft delete)', () => {
  it('Operacional não exclui; Admin exclui, some das telas e fica no banco e na auditoria', async () => {
    const q = await cotacao({ status: 'APROVADA' });
    const url = `/api/quotes/${q.id}`;
    expect((await req(app, oper, { method: 'DELETE', url })).statusCode).toBe(403);

    expect((await req(app, admin, { method: 'DELETE', url })).statusCode).toBe(204);
    expect((await req(app, oper, { method: 'GET', url })).statusCode).toBe(404);
    expect((await relatorio(oper)).json().stats.count).toBe(0);
    expect((await req(app, admin, { method: 'DELETE', url })).statusCode).toBe(404);

    const noBanco = await db.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(noBanco.deletedAt).not.toBeNull();
    const log = await db.auditLog.findFirst({ where: { action: 'EXCLUIR', entity: 'cotacao' } });
    expect(log?.entityId).toBe(q.id);
    expect(log?.username).toBe('chefe');
  });
});

describe('Dashboard', () => {
  const agora = new Date('2026-11-08T15:00:00Z'); // 08/11/2026 12h em São Paulo

  beforeEach(async () => {
    // Setembro
    await cotacao({
      status: 'APROVADA',
      total: '1000.00',
      createdAt: new Date('2026-09-10T12:00:00Z'),
    });
    // Outubro (inclui 31/10 23h SP = 01/11 02h UTC)
    await cotacao({
      status: 'DECLINADA',
      total: '745.00',
      createdAt: new Date('2026-10-20T12:00:00Z'),
    });
    await cotacao({
      modal: 'AEREO',
      status: 'APROVADA',
      originCity: 'Campinas',
      destCity: 'Recife',
      destUf: 'PE',
      total: '1935.00',
      createdAt: new Date('2026-11-01T02:00:00Z'),
    });
    // Novembro, hoje
    await ftl({ createdAt: new Date('2026-11-08T13:00:00Z') });
    await cotacao({
      status: 'RECUSADA',
      total: '50.00',
      createdAt: new Date('2026-11-08T14:00:00Z'),
    });
    await cotacao({ total: '745.00', createdAt: new Date('2026-11-08T14:30:00Z') });
    // Excluída: nunca conta
    await cotacao({
      status: 'APROVADA',
      total: '9999.00',
      deletedAt: new Date(),
      createdAt: agora,
    });
  });

  it('KPIs: conversão = Aprovadas ÷ (Aprovadas + Declinadas); Recusadas e Pendentes fora', async () => {
    const d = await dadosDashboard(db, {}, agora);
    expect(d.kpis).toEqual({
      total: 6,
      today: 3,
      approved: 2,
      declined: 1,
      quotedValue: '5555.00', // 1000 + 745 + 1935 + 1080 + 50 + 745
      approvedValue: '2935.00',
      conversionPct: '66.6667',
    });
    expect(d.period.today).toBe('2026-11-08');
  });

  it('filtro por modal e período', async () => {
    const soFtl = await dadosDashboard(db, { modal: 'FTL' }, agora);
    expect(soFtl.kpis).toMatchObject({
      total: 1,
      today: 1,
      quotedValue: '1080.00',
      conversionPct: null,
    });

    const outubro = await dadosDashboard(db, { from: '2026-10-01', to: '2026-10-31' }, agora);
    expect(outubro.kpis).toMatchObject({
      total: 2,
      approved: 1,
      declined: 1,
      conversionPct: '50.0000',
    });
    expect(outubro.kpis.today).toBe(3); // "hoje" não depende do período
  });

  it('volume mensal por modal no fuso de São Paulo, com meses vazios preenchidos', async () => {
    const d = await dadosDashboard(db, { from: '2026-08-01', to: '2026-11-30' }, agora);
    expect(d.monthly.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(d.monthly[0]).toMatchObject({ AEREO: 0, RODOVIARIO: 0, FTL: 0 });
    expect(d.monthly[2]).toMatchObject({ AEREO: 1, RODOVIARIO: 1, FTL: 0, AEREO_value: '1935.00' });
    expect(d.monthly[3]).toMatchObject({
      AEREO: 0,
      RODOVIARIO: 2,
      FTL: 1,
      RODOVIARIO_value: '795.00',
    });

    const semPeriodo = await dadosDashboard(db, {}, agora);
    expect(semPeriodo.monthly.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('Top rotas: mais cotadas primeiro, FTL como "Tabela FTL: UF Capital"', async () => {
    const d = await dadosDashboard(db, {}, agora);
    expect(d.topRoutes[0]).toEqual({
      route: 'São Paulo, SP → Salvador, BA',
      ftl: false,
      count: 4,
      value: '2540.00',
    });
    expect(d.topRoutes.map((r) => r.route)).toEqual([
      'São Paulo, SP → Salvador, BA',
      'Campinas, SP → Recife, PE',
      'Tabela FTL: SP Capital',
    ]);
    expect(
      rotuloRota({
        originCity: null,
        originUf: null,
        destCity: null,
        destUf: null,
        ftlLocality: null,
      }),
    ).toBe('— → —');
  });

  it('distribuição por status e atividade recente (mais nova primeiro, sem excluídas)', async () => {
    const d = await dadosDashboard(db, {}, agora);
    expect(d.byStatus.map((s) => [s.status, s.count])).toEqual([
      ['PENDENTE', 2],
      ['APROVADA', 2],
      ['DECLINADA', 1],
      ['RECUSADA', 1],
    ]);
    expect(d.recent).toHaveLength(8);
    expect(d.recent[0]).toMatchObject({ from: null, to: 'PENDENTE', user: 'OPER' });
    expect(d.recent[0]!.quote.total).toBe('745.00');
    expect(d.recent.some((e) => e.quote.total === '9999.00')).toBe(false);
  });

  it('pela API, para qualquer usuário logado', async () => {
    const res = await req(app, oper, { method: 'GET', url: '/api/dashboard?modal=RODOVIARIO' });
    expect(res.statusCode).toBe(200);
    expect(res.json().kpis.total).toBe(4);
    expect(
      (await req(app, oper, { method: 'GET', url: '/api/dashboard?modal=X' })).statusCode,
    ).toBe(400);
  });
});
