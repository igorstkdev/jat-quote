import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../src/seed.js';
import { CONDICOES_FTL_PADRAO, LINKS_RASTREIO_PADRAO } from '../src/lib/settings.js';
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

describe('configurações', () => {
  it('padrões de fábrica: ad valorem 0,47/0,15 e condições do FTL', async () => {
    const res = await req(app, oper, { method: 'GET', url: '/api/settings' });
    expect(res.json()).toEqual({
      adValorem: { AEREO: '0.47', RODOVIARIO: '0.15' },
      condicoesFtl: CONDICOES_FTL_PADRAO,
      linksRastreio: LINKS_RASTREIO_PADRAO,
    });
  });

  it('Admin edita os links de rastreio; Operacional não', async () => {
    const links = [{ name: 'Rastreio LATAM', url: 'https://www.latamcargo.com/' }];
    const negado = await req(app, oper, {
      method: 'PUT',
      url: '/api/settings/tracking-links',
      payload: { links },
    });
    expect(negado.statusCode).toBe(403);
    const ok = await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/tracking-links',
      payload: { links },
    });
    expect(ok.json().linksRastreio).toEqual(links);
    expect(
      (await req(app, oper, { method: 'GET', url: '/api/settings' })).json().linksRastreio,
    ).toEqual(links);
    const inval = await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/tracking-links',
      payload: { links: [{ name: 'X', url: 'ftp://x' }] },
    });
    expect(inval.statusCode).toBe(400);
  });

  it('Admin altera ad valorem padrão (aceita vírgula); Operacional não', async () => {
    const negado = await req(app, oper, {
      method: 'PUT',
      url: '/api/settings/ad-valorem',
      payload: { AEREO: '1', RODOVIARIO: '1' },
    });
    expect(negado.statusCode).toBe(403);
    const ok = await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/ad-valorem',
      payload: { AEREO: '0,5', RODOVIARIO: '0.15' },
    });
    expect(ok.json().adValorem).toEqual({ AEREO: '0.5', RODOVIARIO: '0.15' });
    const log = await db.auditLog.findFirst({ where: { entity: 'configuracao' } });
    expect(log?.details).toEqual({ AEREO: { de: '0.47', para: '0.5' } });
    const inval = await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/ad-valorem',
      payload: { AEREO: '101', RODOVIARIO: '0' },
    });
    expect(inval.json().message).toBe(
      'Informe um percentual entre 0 e 100, com até 4 casas decimais.',
    );
  });

  it('Admin edita as condições comerciais do FTL', async () => {
    const res = await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/ftl-conditions',
      payload: { text: 'Novo texto das condições.' },
    });
    expect(res.json().condicoesFtl).toBe('Novo texto das condições.');
    expect(
      (await req(app, oper, { method: 'GET', url: '/api/settings' })).json().condicoesFtl,
    ).toBe('Novo texto das condições.');
    expect(
      (
        await req(app, oper, {
          method: 'PUT',
          url: '/api/settings/ftl-conditions',
          payload: { text: 'xxxxxxxxxxxx' },
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('links úteis', () => {
  it('CRUD pelo Admin; Operacional só vê os ativos', async () => {
    const criado = await req(app, admin, {
      method: 'POST',
      url: '/api/links',
      payload: { name: 'Qualp', url: 'https://qualp.com.br/#/' },
    });
    expect(criado.statusCode).toBe(201);
    const id = criado.json().link.id;
    await req(app, admin, {
      method: 'POST',
      url: '/api/links',
      payload: { name: 'Oculto', url: 'https://x.com', active: false },
    });

    const oLinks = (await req(app, oper, { method: 'GET', url: '/api/links?all=1' })).json().links;
    expect(oLinks.map((l: { name: string }) => l.name)).toEqual(['Qualp']);
    const aLinks = (await req(app, admin, { method: 'GET', url: '/api/links?all=1' })).json().links;
    expect(aLinks).toHaveLength(2);

    expect(
      (
        await req(app, oper, {
          method: 'POST',
          url: '/api/links',
          payload: { name: 'X', url: 'https://x.com' },
        })
      ).statusCode,
    ).toBe(403);

    const ed = await req(app, admin, {
      method: 'PATCH',
      url: `/api/links/${id}`,
      payload: { name: 'QualP' },
    });
    expect(ed.json().link.name).toBe('QualP');

    await req(app, admin, {
      method: 'PUT',
      url: '/api/links/order',
      payload: { ids: [aLinks[1].id, id] },
    });
    const ordem = (await req(app, admin, { method: 'GET', url: '/api/links?all=1' })).json().links;
    expect(ordem.map((l: { name: string }) => l.name)).toEqual(['Oculto', 'QualP']);

    expect((await req(app, admin, { method: 'DELETE', url: `/api/links/${id}` })).statusCode).toBe(
      200,
    );
    expect(await db.auditLog.count({ where: { entity: 'link' } })).toBe(4);
  });

  it('URL precisa ser http(s) completa', async () => {
    const r1 = await req(app, admin, {
      method: 'POST',
      url: '/api/links',
      payload: { name: 'X', url: 'qualp.com.br' },
    });
    expect(r1.json().message).toBe(
      'Informe um endereço completo, começando com http:// ou https://.',
    );
    const r2 = await req(app, admin, {
      method: 'POST',
      url: '/api/links',
      payload: { name: 'X', url: 'javascript:alert(1)' },
    });
    expect(r2.statusCode).toBe(400);
  });
});

describe('seed', () => {
  it('cria o Admin com troca obrigatória, configurações e links; é idempotente', async () => {
    await limparBanco(db);
    const r1 = await seed(db);
    expect(r1.senhaAdmin).toMatch(/^[A-Za-z0-9]{12}$/);
    const u = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(u).toMatchObject({ role: 'ADMIN', mustChangePassword: true, canEditRates: true });
    expect(await db.usefulLink.count()).toBe(2);
    expect(await db.setting.count()).toBe(2);

    const r2 = await seed(db);
    expect(r2.senhaAdmin).toBeNull();
    expect(await db.user.count()).toBe(1);
    expect(await db.usefulLink.count()).toBe(2);
  });

  it('Admin com o login escolhido na instalação (validado)', async () => {
    await limparBanco(db);
    const r = await seed(db, { adminUsername: ' Maria.Souza ' });
    expect(r.adminUsername).toBe('maria.souza');
    expect(await db.user.findUnique({ where: { username: 'maria.souza' } })).not.toBeNull();
    await limparBanco(db);
    await expect(seed(db, { adminUsername: 'josé' })).rejects.toThrow(/sem acento/);
  });
});

describe('auditoria', () => {
  it('somente Admin consulta; filtros por entidade e usuário', async () => {
    await req(app, oper, { method: 'POST', url: '/api/clients', payload: { name: 'Cliente A' } });
    expect((await req(app, oper, { method: 'GET', url: '/api/audit' })).statusCode).toBe(403);
    const todos = (await req(app, admin, { method: 'GET', url: '/api/audit' })).json();
    expect(todos.total).toBeGreaterThanOrEqual(3); // 2 logins + 1 cliente
    const clientes = (
      await req(app, admin, { method: 'GET', url: '/api/audit?entity=cliente' })
    ).json();
    expect(clientes.logs).toHaveLength(1);
    expect(clientes.logs[0]).toMatchObject({
      action: 'CRIAR',
      username: 'oper',
      details: { name: 'Cliente A' },
    });
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    const porData = (
      await req(app, admin, {
        method: 'GET',
        url: `/api/audit?from=${hoje}&to=${hoje}&username=OPER`,
      })
    ).json();
    expect(porData.logs.every((l: { username: string }) => l.username === 'oper')).toBe(true);
    expect(porData.total).toBe(2);
  });
});
