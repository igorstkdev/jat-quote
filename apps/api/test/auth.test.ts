import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { COOKIE_SESSAO } from '../src/plugins/auth.js';
import {
  criarAppTeste,
  criarDbTeste,
  criarUsuario,
  limparBanco,
  login,
  req,
  SENHA,
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

const postLogin = (username: string, password: string) =>
  req(app, null, { method: 'POST', url: '/api/auth/login', payload: { username, password } });

describe('login', () => {
  it('entra com usuário e senha (ignora maiúsculas no usuário) e cria cookie httpOnly', async () => {
    await criarUsuario(db, 'maria');
    const res = await postLogin('  MARIA ', SENHA);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: 'maria', role: 'OPERACIONAL' });
    const cookie = res.cookies.find((c) => c.name === COOKIE_SESSAO)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    // O token nunca é gravado em claro no banco
    const sessoes = await db.session.findMany();
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]!.id).not.toBe(cookie.value);
    const log = await db.auditLog.findFirst({ where: { action: 'LOGIN' } });
    expect(log?.username).toBe('maria');
  });

  it('senha errada e usuário inexistente têm a mesma mensagem', async () => {
    await criarUsuario(db, 'maria');
    const a = await postLogin('maria', 'Errada123');
    const b = await postLogin('ninguem', 'Errada123');
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().message).toBe('Usuário ou senha inválidos.');
    expect(b.json().message).toBe('Usuário ou senha inválidos.');
    expect(await db.auditLog.count({ where: { action: 'LOGIN_FALHOU' } })).toBe(2);
  });

  it('5 tentativas erradas bloqueiam por 15 minutos (até a senha certa)', async () => {
    await criarUsuario(db, 'maria');
    for (let i = 0; i < 5; i++)
      expect((await postLogin('maria', 'Errada123')).statusCode).toBe(401);
    const bloqueado = await postLogin('maria', SENHA);
    expect(bloqueado.statusCode).toBe(423);
    expect(bloqueado.json().message).toContain('bloqueado');
    const u = await db.user.findUniqueOrThrow({ where: { username: 'maria' } });
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it('usuário desativado não entra', async () => {
    await criarUsuario(db, 'maria', { active: false });
    const res = await postLogin('maria', SENHA);
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Usuário desativado. Procure o Admin.');
  });

  it('valida a entrada com mensagens em português', async () => {
    const res = await postLogin('', '');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Informe o usuário.');
  });
});

describe('sessão', () => {
  it('/api/auth/me sem login → 401', async () => {
    const res = await req(app, null, { method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Faça login para continuar.');
  });

  it('/api/auth/me com login devolve o usuário', async () => {
    await criarUsuario(db, 'joao', { role: 'ADMIN' });
    const cookie = await login(app, 'joao');
    const res = await req(app, cookie, { method: 'GET', url: '/api/auth/me' });
    expect(res.json().user).toMatchObject({ username: 'joao', role: 'ADMIN' });
  });

  it('cookie inválido é ignorado; sessão expirada é apagada', async () => {
    await criarUsuario(db, 'joao');
    const cookie = await login(app, 'joao');
    expect(
      (await req(app, `${COOKIE_SESSAO}=lixo`, { method: 'GET', url: '/api/auth/me' })).statusCode,
    ).toBe(401);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await req(app, cookie, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    expect(await db.session.count()).toBe(0);
  });

  it('logout encerra a sessão', async () => {
    await criarUsuario(db, 'joao');
    const cookie = await login(app, 'joao');
    expect((await req(app, cookie, { method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(
      200,
    );
    expect((await req(app, cookie, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
  });

  it('usuário desativado perde o acesso na hora', async () => {
    const u = await criarUsuario(db, 'joao');
    const cookie = await login(app, 'joao');
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    expect((await req(app, cookie, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
  });

  it('requisição que altera dados sem o cabeçalho anti-CSRF é bloqueada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'x', password: 'y' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('bloqueada por segurança');
  });
});

describe('troca de senha', () => {
  it('troca obrigatória bloqueia o resto do sistema até trocar', async () => {
    await criarUsuario(db, 'novo', { mustChangePassword: true });
    const cookie = await login(app, 'novo');
    const bloqueado = await req(app, cookie, { method: 'GET', url: '/api/clients' });
    expect(bloqueado.statusCode).toBe(403);
    expect(bloqueado.json().message).toBe('Troque sua senha para continuar.');

    const troca = await req(app, cookie, {
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: SENHA, newPassword: 'NovaSenha9' },
    });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().user.mustChangePassword).toBe(false);
    expect((await req(app, cookie, { method: 'GET', url: '/api/clients' })).statusCode).toBe(200);
    await login(app, 'novo', 'NovaSenha9');
    expect(await db.auditLog.count({ where: { action: 'SENHA_ALTERADA' } })).toBe(1);
  });

  it('regras: senha atual correta, mínimo 8, letras e números, diferente da atual', async () => {
    await criarUsuario(db, 'ana');
    const cookie = await login(app, 'ana');
    const trocar = (currentPassword: string, newPassword: string) =>
      req(app, cookie, {
        method: 'POST',
        url: '/api/auth/change-password',
        payload: { currentPassword, newPassword },
      });
    expect((await trocar('Errada123', 'NovaSenha9')).json().message).toBe('Senha atual incorreta.');
    expect((await trocar(SENHA, 'Ab1')).json().message).toBe(
      'A senha deve ter pelo menos 8 caracteres.',
    );
    expect((await trocar(SENHA, 'somenteletras')).json().message).toBe(
      'A senha deve ter letras e números.',
    );
    expect((await trocar(SENHA, '12345678')).json().message).toBe(
      'A senha deve ter letras e números.',
    );
    expect((await trocar(SENHA, SENHA)).json().message).toBe(
      'A nova senha deve ser diferente da atual.',
    );
  });

  it('trocar a senha encerra as outras sessões', async () => {
    await criarUsuario(db, 'ana');
    const c1 = await login(app, 'ana');
    const c2 = await login(app, 'ana');
    await req(app, c1, {
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: SENHA, newPassword: 'NovaSenha9' },
    });
    expect((await req(app, c1, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(200);
    expect((await req(app, c2, { method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
  });
});

describe('limite de tentativas por IP', () => {
  it('mais de N logins por minuto do mesmo IP → 429 em português', async () => {
    const app2 = await (
      await import('../src/app.js')
    ).buildApp({ db, webDist: '__x__', loginRateLimit: 2, licenca: false });
    const tentar = () =>
      app2.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-jat-requested': '1' },
        payload: { username: 'a', password: 'b' },
      });
    await tentar();
    await tentar();
    const res = await tentar();
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toBe('Muitas tentativas. Aguarde um minuto e tente de novo.');
    await app2.close();
  });
});
