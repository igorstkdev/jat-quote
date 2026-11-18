import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  admin = await login(app, 'chefe');
  oper = await login(app, 'oper');
});

/** Planilha no layout do relatório exportado (datas sem fuso, como o Excel grava). */
async function planilha(linhas: unknown[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cotações');
  ws.addRow(['Nº', 'DATA', 'CLIENTE', 'ROTA', 'MODAL', 'TOTAL', 'STATUS', 'Criada por']);
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

const LINHAS = [
  [
    'JQ-000001',
    new Date(Date.UTC(2025, 10, 17, 20, 26)),
    'Osten Group',
    'São Paulo, SP → Betim, MG',
    'Aéreo',
    1360,
    'Aprovada',
    'Administrador',
  ],
  [
    'JQ-000002',
    new Date(Date.UTC(2025, 10, 18, 17, 23)),
    'peugeot',
    "Santa Barbara D'Oeste, SP → Simões Filho, BA",
    'Rodoviário',
    9883.5,
    'Recusada',
    'Administrador',
  ],
  [
    'JQ-000003',
    new Date(Date.UTC(2025, 10, 19, 9, 0)),
    'Peugeot',
    'Bluemenau, SC → Feira de Santana, BA',
    'Rodoviário',
    950,
    'Pendente',
    'Administrador',
  ],
];

const importar = (cookie: string, file: string, confirm = false) =>
  req(app, cookie, { method: 'POST', url: '/api/quotes/import', payload: { file, confirm } });

describe('importar cotações de teste (Excel)', () => {
  it('prévia, confirmação e dados gravados como teste', async () => {
    const file = await planilha(LINHAS);
    const previa = (await importar(admin, file)).json();
    expect(previa).toMatchObject({ applied: false, summary: { total: 3, criar: 3, erros: 0 } });
    expect(await db.quote.count()).toBe(0);

    const r = (await importar(admin, file, true)).json();
    expect(r).toMatchObject({ applied: true, clientesCriados: 2 });

    const qs = await db.quote.findMany({
      orderBy: { number: 'asc' },
      include: { statusChanges: true },
    });
    expect(qs.map((q) => q.number)).toEqual([1, 2, 3]);
    const [a, b, c] = qs;
    expect(a).toMatchObject({
      modal: 'AEREO',
      status: 'APROVADA',
      isTestData: true,
      clientName: 'Osten Group',
    });
    expect(a!.total.toString()).toBe('1360');
    expect(a!.costAir?.toString()).toBe('1360');
    expect(a!.markupPct.toString()).toBe('0');
    expect(a!.createdAt.toISOString()).toBe('2025-11-17T23:26:00.000Z'); // 20:26 em Brasília
    expect(a!.statusChanges[0]).toMatchObject({ fromStatus: null, toStatus: 'APROVADA' });
    expect(b!.originCity).toBe("Santa Bárbara d'Oeste"); // achada no IBGE sem acento
    expect(b!.clientId).toBe(c!.clientId); // "peugeot" e "Peugeot" = mesmo cliente
    expect(c!.originCity).toBe('Bluemenau'); // não está no IBGE: fica como veio
    expect((a!.terms as { topicos: string[] }).topicos).toContain('ICMS e seguro a incluir.');

    // A numeração continua depois da maior importada.
    const nova = await req(app, oper, { method: 'POST', url: `/api/quotes/${a!.id}/duplicate` });
    expect(nova.json().quote.code).toBe('JQ-000004');
    expect(nova.json().quote.isTestData).toBe(false);
  });

  it('erros por linha: número já usado, repetido, rota, modal, total e status', async () => {
    await importar(admin, await planilha([LINHAS[0]!]), true);
    const r = (
      await importar(
        admin,
        await planilha([
          LINHAS[0]!,
          ['JQ-000010', new Date(), 'X', 'São Paulo → Betim, MG', 'Aéreo', 10, 'Pendente'],
          ['JQ-000011', new Date(), 'X', 'São Paulo, SP → Betim, MG', 'FTL', 10, 'Pendente'],
          ['JQ-000012', new Date(), 'X', 'São Paulo, SP → Betim, MG', 'Aéreo', 0, 'Pendente'],
          ['JQ-000013', new Date(), 'X', 'São Paulo, SP → Betim, MG', 'Aéreo', 10, 'Cancelada'],
          ['JQ-000014', new Date(), 'X', 'São Paulo, SP → Betim, MG', 'Aéreo', 10, 'Pendente'],
          ['JQ-000014', new Date(), 'X', 'São Paulo, SP → Betim, MG', 'Aéreo', 10, 'Pendente'],
        ]),
        true,
      )
    ).json();
    expect(r.applied).toBe(false);
    const erros = r.rows
      .filter((x: { acao: string }) => x.acao === 'erro')
      .map((x: { erro: string }) => x.erro);
    expect(erros).toEqual([
      'JQ-000001 já existe no sistema.',
      'ROTA "São Paulo → Betim, MG" inválida (use "Cidade, UF → Cidade, UF").',
      'MODAL "FTL" inválido: use Aéreo ou Rodoviário.',
      'TOTAL "0" inválido.',
      'STATUS "Cancelada" inválido.',
      'Nº repetido na planilha.',
    ]);
    expect(await db.quote.count()).toBe(1); // com erro, nada é importado
  });

  it('planilha fora do formato e permissão só de Admin', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x').addRow(['Cliente', 'Valor']);
    const errada = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const r = await importar(admin, errada);
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toBe(
      'A planilha não está no formato esperado. Coluna ausente: Nº, DATA, ROTA, MODAL, TOTAL, STATUS.',
    );
    expect(
      (await importar(admin, Buffer.from('não é xlsx').toString('base64'))).json().message,
    ).toBe('Não foi possível ler o arquivo. Envie a planilha .xlsx exportada do relatório.');
    expect((await importar(oper, await planilha(LINHAS))).statusCode).toBe(403);
  });

  it('remover dados de teste apaga só as importadas, com confirmação forte', async () => {
    await importar(admin, await planilha(LINHAS), true);
    const a = await db.quote.findFirstOrThrow({ where: { number: 1 } });
    await req(app, oper, { method: 'POST', url: `/api/quotes/${a.id}/duplicate` }); // real
    expect((await req(app, admin, { method: 'GET', url: '/api/quotes/test-data' })).json()).toEqual(
      { count: 3 },
    );

    const sem = await req(app, admin, {
      method: 'POST',
      url: '/api/quotes/test-data/remove',
      payload: { confirmation: 'sim' },
    });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().message).toBe('Digite REMOVER DADOS DE TESTE para confirmar.');

    const ok = await req(app, admin, {
      method: 'POST',
      url: '/api/quotes/test-data/remove',
      payload: { confirmation: 'remover dados de teste' },
    });
    expect(ok.json()).toEqual({ removed: 3 });
    expect(await db.quote.count()).toBe(1);
    expect(await db.quoteStatusChange.count()).toBe(1);
    expect(await db.client.count()).toBe(2); // clientes ficam
    expect(
      await db.auditLog.count({
        where: { entity: 'cotacao', action: { in: ['IMPORTAR', 'EXCLUIR'] } },
      }),
    ).toBe(2);
  });
});
