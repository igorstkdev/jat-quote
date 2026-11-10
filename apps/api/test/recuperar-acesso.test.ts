import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recuperarAcessoAdmin } from '../src/lib/recuperar-acesso.js';
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

beforeAll(async () => {
  app = await criarAppTeste(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await limparBanco(db);
});

describe('recuperação de acesso do Admin (linha de comando)', () => {
  it('gera senha temporária, desbloqueia, encerra sessões e registra na auditoria', async () => {
    const admin = await criarUsuario(db, 'admin', { role: 'ADMIN' });
    const sessaoAntiga = await login(app, 'admin');
    await db.user.update({
      where: { id: admin.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) },
    });

    const r = await recuperarAcessoAdmin(db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.username).toBe('admin');

    const depois = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.mustChangePassword).toBe(true);
    expect(depois.failedLoginCount).toBe(0);
    expect(depois.lockedUntil).toBeNull();

    const me = await req(app, sessaoAntiga, { method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
    await expect(login(app, 'admin')).rejects.toThrow();
    await expect(login(app, 'admin', r.senhaTemporaria)).resolves.toBeTruthy();

    const log = await db.auditLog.findFirst({ where: { action: 'SENHA_REDEFINIDA' } });
    expect(log?.entityId).toBe(admin.id);
    expect(JSON.stringify(log?.details)).not.toContain(r.senhaTemporaria);
  });

  it('aceita outro Admin pelo nome, sem diferenciar maiúsculas', async () => {
    await criarUsuario(db, 'maria', { role: 'ADMIN' });
    const r = await recuperarAcessoAdmin(db, ' MARIA ');
    expect(r.ok && r.username).toBe('maria');
  });

  it('recusa usuário inexistente, Operacional ou desativado e lista os Admins ativos', async () => {
    await criarUsuario(db, 'chefe', { role: 'ADMIN' });
    await criarUsuario(db, 'oper');
    await criarUsuario(db, 'antigo', { role: 'ADMIN', active: false });

    const semAdmin = await recuperarAcessoAdmin(db);
    expect(semAdmin).toEqual({
      ok: false,
      erro: 'Usuário "admin" não encontrado. Admins ativos: chefe.',
    });
    const oper = await recuperarAcessoAdmin(db, 'oper');
    expect(!oper.ok && oper.erro).toContain('não é Admin');
    const antigo = await recuperarAcessoAdmin(db, 'antigo');
    expect(!antigo.ok && antigo.erro).toContain('está desativado');
  });

  it('sem nenhum Admin ativo, avisa', async () => {
    const r = await recuperarAcessoAdmin(db, 'ninguem');
    expect(r).toEqual({
      ok: false,
      erro: 'Usuário "ninguem" não encontrado. Nenhum Admin ativo encontrado.',
    });
  });
});
