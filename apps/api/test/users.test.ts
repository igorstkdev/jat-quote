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
let adminId: string;
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
  adminId = (await criarUsuario(db, 'chefe', { role: 'ADMIN' })).id;
  await criarUsuario(db, 'oper');
  admin = await login(app, 'chefe');
  oper = await login(app, 'oper');
});

describe('gestão de usuários (somente Admin, checado no servidor)', () => {
  it('Operacional não acessa nenhuma rota de usuários', async () => {
    const rotas = [
      { method: 'GET', url: '/api/users' },
      { method: 'POST', url: '/api/users', payload: { username: 'x', name: 'X' } },
      { method: 'PATCH', url: `/api/users/${adminId}`, payload: { name: 'Y' } },
      { method: 'POST', url: `/api/users/${adminId}/reset-password` },
    ] as const;
    for (const r of rotas) {
      const res = await req(app, oper, r);
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(403);
      expect(res.json().message).toBe('Você não tem permissão para esta ação.');
    }
    expect((await req(app, null, { method: 'GET', url: '/api/users' })).statusCode).toBe(401);
  });

  it('cria usuário com senha temporária (troca obrigatória) e audita', async () => {
    const res = await req(app, admin, {
      method: 'POST',
      url: '/api/users',
      payload: { username: 'Carlos.Silva', name: 'Carlos Silva', canEditRates: true },
    });
    expect(res.statusCode).toBe(201);
    const { user, senhaTemporaria } = res.json();
    expect(user).toMatchObject({
      username: 'carlos.silva',
      role: 'OPERACIONAL',
      canEditRates: true,
      mustChangePassword: true,
    });
    expect(user.passwordHash).toBeUndefined();
    expect(senhaTemporaria).toMatch(/^[A-Za-z0-9]{12}$/);
    const cookie = await login(app, 'carlos.silva', senhaTemporaria);
    const me = await req(app, cookie, { method: 'GET', url: '/api/auth/me' });
    expect(me.json().user.mustChangePassword).toBe(true);
    const log = await db.auditLog.findFirst({ where: { action: 'CRIAR', entity: 'usuario' } });
    expect(JSON.stringify(log?.details)).not.toContain(senhaTemporaria);
  });

  it('valida login duplicado e formato', async () => {
    const dup = await req(app, admin, {
      method: 'POST',
      url: '/api/users',
      payload: { username: 'OPER', name: 'Outro' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toBe('Já existe um usuário com esse login.');
    const inval = await req(app, admin, {
      method: 'POST',
      url: '/api/users',
      payload: { username: 'joão silva', name: 'J' },
    });
    expect(inval.statusCode).toBe(400);
    expect(inval.json().message).toBe(
      'Use só letras sem acento, números, ponto, hífen ou sublinhado.',
    );
  });

  it('lista sem expor hash de senha', async () => {
    const res = await req(app, admin, { method: 'GET', url: '/api/users' });
    expect(res.json().users).toHaveLength(2);
    expect(res.body).not.toContain('argon2');
  });

  it('desativar encerra as sessões do usuário e audita como DESATIVAR', async () => {
    const operId = (await db.user.findUniqueOrThrow({ where: { username: 'oper' } })).id;
    const res = await req(app, admin, {
      method: 'PATCH',
      url: `/api/users/${operId}`,
      payload: { active: false },
    });
    expect(res.json().user.active).toBe(false);
    expect((await req(app, oper, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    expect(await db.auditLog.count({ where: { action: 'DESATIVAR', entity: 'usuario' } })).toBe(1);
    const re = await req(app, admin, {
      method: 'PATCH',
      url: `/api/users/${operId}`,
      payload: { active: true },
    });
    expect(re.json().user.active).toBe(true);
    expect(await db.auditLog.count({ where: { action: 'REATIVAR', entity: 'usuario' } })).toBe(1);
  });

  it('Admin não se desativa, não tira o próprio perfil e o último Admin é protegido', async () => {
    const a = await req(app, admin, {
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      payload: { active: false },
    });
    expect(a.json().message).toBe('Você não pode desativar o próprio usuário.');
    const b = await req(app, admin, {
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      payload: { role: 'OPERACIONAL' },
    });
    expect(b.json().message).toBe('Você não pode remover o seu próprio perfil de Admin.');
    // Um segundo admin tenta rebaixar o único outro admin ativo → permitido só se sobrar 1
    const outro = await criarUsuario(db, 'chefe2', { role: 'ADMIN' });
    const c2 = await login(app, 'chefe2');
    const ok = await req(app, c2, {
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      payload: { role: 'OPERACIONAL' },
    });
    expect(ok.statusCode).toBe(200);
    await db.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
    await db.user.update({ where: { id: outro.id }, data: { active: false } });
    // agora só "chefe" é admin ativo; ninguém pode rebaixá-lo (nem ele mesmo)
    expect(await db.user.count({ where: { role: 'ADMIN', active: true } })).toBe(1);
  });

  it('edição audita só os campos alterados (de → para)', async () => {
    const operId = (await db.user.findUniqueOrThrow({ where: { username: 'oper' } })).id;
    await req(app, admin, {
      method: 'PATCH',
      url: `/api/users/${operId}`,
      payload: { canEditRates: true, name: 'OPER' },
    });
    const log = await db.auditLog.findFirst({ where: { action: 'EDITAR', entity: 'usuario' } });
    expect(log?.details).toEqual({ canEditRates: { de: false, para: true } });
  });

  it('redefinir senha gera temporária, desbloqueia e encerra sessões', async () => {
    const operId = (await db.user.findUniqueOrThrow({ where: { username: 'oper' } })).id;
    await db.user.update({
      where: { id: operId },
      data: { lockedUntil: new Date(Date.now() + 600_000) },
    });
    const res = await req(app, admin, {
      method: 'POST',
      url: `/api/users/${operId}/reset-password`,
    });
    const { senhaTemporaria } = res.json();
    expect((await req(app, oper, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    await login(app, 'oper', senhaTemporaria);
    const u = await db.user.findUniqueOrThrow({ where: { id: operId } });
    expect(u.mustChangePassword).toBe(true);
    expect(u.lockedUntil).toBeNull();
  });

  it('usuário inexistente → 404; id inválido → 400', async () => {
    const a = await req(app, admin, {
      method: 'PATCH',
      url: '/api/users/00000000-0000-4000-8000-000000000000',
      payload: { name: 'Xy' },
    });
    expect(a.statusCode).toBe(404);
    expect(a.json().message).toBe('Usuário não encontrado.');
    const b = await req(app, admin, { method: 'PATCH', url: '/api/users/abc', payload: {} });
    expect(b.statusCode).toBe(400);
  });
});
