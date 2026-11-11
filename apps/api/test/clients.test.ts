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

const criar = (cookie: string, payload: object) =>
  req(app, cookie, { method: 'POST', url: '/api/clients', payload });

describe('clientes', () => {
  it('Operacional cadastra e edita; documento só com dígitos; e-mail em minúsculas', async () => {
    const res = await criar(oper, {
      name: '  Fiat Automóveis ',
      document: '16.701.716/0001-56',
      email: 'Compras@Fiat.com',
      contact: '',
    });
    expect(res.statusCode).toBe(201);
    const c = res.json().client;
    expect(c).toMatchObject({
      name: 'Fiat Automóveis',
      document: '16701716000156',
      email: 'compras@fiat.com',
      contact: null,
      active: true,
    });
    const ed = await req(app, oper, {
      method: 'PATCH',
      url: `/api/clients/${c.id}`,
      payload: { phone: '(11) 4000-0000' },
    });
    expect(ed.json().client.phone).toBe('(11) 4000-0000');
    const log = await db.auditLog.findFirst({ where: { action: 'EDITAR', entity: 'cliente' } });
    expect(log?.details).toEqual({ phone: { de: null, para: '(11) 4000-0000' } });
  });

  it('validação em português', async () => {
    expect((await criar(oper, { name: 'A' })).json().message).toBe('Informe o nome do cliente.');
    expect((await criar(oper, { name: 'Teste', document: '123' })).json().message).toBe(
      'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
    );
    expect((await criar(oper, { name: 'Teste', email: 'x@' })).json().message).toBe(
      'E-mail inválido.',
    );
  });

  it('nome duplicado entre ativos é bloqueado (sem diferenciar maiúsculas)', async () => {
    await criar(oper, { name: 'Stellantis' });
    const dup = await criar(oper, { name: 'STELLANTIS' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toBe('Já existe um cliente ativo com esse nome.');
  });

  it('busca em tempo real por nome, contato, e-mail ou documento', async () => {
    await criar(oper, { name: 'Fiat', document: '16701716000156' });
    await criar(oper, { name: 'Bosch', contact: 'Fernanda' });
    const busca = async (q: string) =>
      (await req(app, oper, { method: 'GET', url: `/api/clients?search=${encodeURIComponent(q)}` }))
        .json()
        .clients.map((c: { name: string }) => c.name);
    expect(await busca('fi')).toEqual(['Fiat']);
    expect(await busca('fernanda')).toEqual(['Bosch']);
    expect(await busca('16.701')).toEqual(['Fiat']);
    expect(await busca('')).toEqual(['Bosch', 'Fiat']);
  });

  it('excluir = desativar, somente Admin; inativo some da lista padrão; reativar', async () => {
    const id = (await criar(oper, { name: 'Antigo' })).json().client.id;
    const negado = await req(app, oper, { method: 'POST', url: `/api/clients/${id}/deactivate` });
    expect(negado.statusCode).toBe(403);

    const des = await req(app, admin, { method: 'POST', url: `/api/clients/${id}/deactivate` });
    expect(des.json().client.active).toBe(false);
    expect(await db.client.count()).toBe(1); // continua no banco (soft delete)

    const ativos = await req(app, oper, { method: 'GET', url: '/api/clients' });
    expect(ativos.json().clients).toHaveLength(0);
    const inativos = await req(app, oper, { method: 'GET', url: '/api/clients?status=inativos' });
    expect(inativos.json().clients).toHaveLength(1);

    // nome de inativo pode ser reaproveitado; ao reativar, conflito é detectado
    await criar(oper, { name: 'antigo' });
    const re = await req(app, admin, { method: 'POST', url: `/api/clients/${id}/reactivate` });
    expect(re.statusCode).toBe(409);
    expect(await db.auditLog.count({ where: { action: 'DESATIVAR', entity: 'cliente' } })).toBe(1);
  });

  it('reativar quando não há conflito', async () => {
    const id = (await criar(oper, { name: 'Volta' })).json().client.id;
    await req(app, admin, { method: 'POST', url: `/api/clients/${id}/deactivate` });
    const re = await req(app, admin, { method: 'POST', url: `/api/clients/${id}/reactivate` });
    expect(re.json().client.active).toBe(true);
    expect(await db.auditLog.count({ where: { action: 'REATIVAR', entity: 'cliente' } })).toBe(1);
  });

  it('cliente inexistente → 404', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(
      (await req(app, oper, { method: 'GET', url: `/api/clients/${id}` })).json().message,
    ).toBe('Cliente não encontrado.');
  });
});

describe('clientes: CSV (migração do Base44)', () => {
  const importar = (cookie: string, csv: string, confirm = false) =>
    req(app, cookie, { method: 'POST', url: '/api/clients/import', payload: { csv, confirm } });

  it('somente Admin importa', async () => {
    const r = await importar(oper, 'Nome\nFiat\n');
    expect(r.statusCode).toBe(403);
  });

  it('prévia não grava; confirma cria e atualiza (vazio mantém), com auditoria', async () => {
    await criar(admin, { name: 'Bosch Ltda.', email: 'antigo@bosch.com.br', phone: '1111' });
    const csv = [
      'Nome;CNPJ/CPF;Contato;E-mail;Telefone;Observações;Status',
      'Fiat Automóveis S.A.;16.701.716/0001-56;Fernanda;LOGISTICA@FIAT.COM.BR;(31) 2123-4000;;Ativo',
      'BOSCH LTDA.;;Ricardo;compras@bosch.com.br;;;',
      'Transportadora Antiga;;;;;Contrato encerrado;Inativo',
    ].join('\r\n');

    const previa = (await importar(admin, csv)).json();
    expect(previa.applied).toBe(false);
    expect(previa.summary).toEqual({ total: 3, criar: 2, atualizar: 1, igual: 0, erros: 0 });
    expect(await db.client.count()).toBe(1);

    const r = (await importar(admin, csv, true)).json();
    expect(r.applied).toBe(true);
    const todos = await db.client.findMany({ orderBy: { name: 'asc' } });
    expect(todos.map((c) => [c.name, c.active])).toEqual([
      ['Bosch Ltda.', true],
      ['Fiat Automóveis S.A.', true],
      ['Transportadora Antiga', false],
    ]);
    const bosch = todos[0]!;
    expect(bosch).toMatchObject({
      contact: 'Ricardo',
      email: 'compras@bosch.com.br',
      phone: '1111',
    });
    expect(todos[1]).toMatchObject({ document: '16701716000156', email: 'logistica@fiat.com.br' });
    expect(await db.auditLog.count({ where: { action: 'IMPORTAR', entity: 'cliente' } })).toBe(1);

    // Rodar de novo não duplica
    const de_novo = (await importar(admin, csv)).json();
    expect(de_novo.summary).toMatchObject({ criar: 0, atualizar: 0, igual: 3 });
  });

  it('separador vírgula, nomes de coluna alternativos e erros por linha (nada é gravado)', async () => {
    const csv = [
      'Cliente,CNPJ,Email,Status',
      'Magazine Exemplo,123,juliana@exemplo.com.br,Ativo',
      'Outro,,nao-e-email,',
      'Magazine exemplo,,,',
      ',,,',
      'Quarto,,,Talvez',
    ].join('\n');
    const r = (await importar(admin, csv, true)).json();
    expect(r.applied).toBe(false);
    expect(r.rows.filter((l: { acao: string }) => l.acao === 'erro')).toEqual([
      {
        linha: 2,
        acao: 'erro',
        rota: 'Magazine Exemplo',
        erro: 'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
      },
      { linha: 3, acao: 'erro', rota: 'Outro', erro: 'E-mail inválido.' },
      {
        linha: 6,
        acao: 'erro',
        rota: 'Quarto',
        erro: 'Status "Talvez" inválido: use Ativo ou Inativo.',
      },
    ]);
    expect(await db.client.count()).toBe(0);

    const ok = 'Cliente,Email\nMagazine Exemplo,juliana@exemplo.com.br\nmagazine exemplo,\n';
    const dup = (await importar(admin, ok)).json();
    expect(dup.rows[1]).toMatchObject({
      acao: 'erro',
      erro: 'Cliente repetido no arquivo (igual à linha 2).',
    });
  });

  it('sem coluna Nome → arquivo recusado', async () => {
    const r = await importar(admin, 'Razao;Fone\nX;1\n');
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toBe('O arquivo não está no formato esperado. Coluna ausente: Nome.');
  });

  it('exporta todos os clientes no mesmo layout (reimportável)', async () => {
    await criar(admin, { name: 'Fiat', document: '16701716000156', email: 'a@fiat.com.br' });
    const r = await req(app, oper, { method: 'GET', url: '/api/clients/export' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/clientes_\d{4}-\d{2}-\d{2}\.csv/);
    expect(r.body.charCodeAt(0)).toBe(0xfeff); // BOM: o Excel abre os acentos certo
    const linhas = r.body.slice(1).trim().split('\r\n');
    expect(linhas).toEqual([
      'Nome;CNPJ/CPF;Contato;E-mail;Telefone;Observações;Status',
      'Fiat;16701716000156;;a@fiat.com.br;;;Ativo',
    ]);
    const de_volta = (await importar(admin, r.body)).json();
    expect(de_volta.summary).toMatchObject({ igual: 1, erros: 0 });
  });
});
