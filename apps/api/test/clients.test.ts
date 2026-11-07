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
