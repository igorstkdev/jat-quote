import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { CHAVE_PUBLICA_LICENCA, CHAVES_LICENCA, derivarChaves } from '../src/lib/licenca.js';
import { criarDbTeste, criarUsuario, limparBanco, login, req, SENHA } from './helpers.js';
import { CHAVE_PUBLICA_TESTE, SENHA_MESTRE_TESTE } from './licenca-teste.js';

const db = criarDbTeste();
let relogio = new Date('2026-11-14T12:00:00-03:00');

function criarApp() {
  return buildApp({
    db,
    webDist: '__inexistente__',
    loginRateLimit: 10_000,
    licenca: { chavePublica: CHAVE_PUBLICA_TESTE, agora: () => relogio },
  });
}
type App = Awaited<ReturnType<typeof criarApp>>;

const ativar = (app: App, corpo: Record<string, unknown>, cookie: string | null = null) =>
  req(app, cookie, { method: 'POST', url: '/api/licenca/ativar', payload: corpo });
const estado = async (app: App, cookie: string | null = null) =>
  (await req(app, cookie, { method: 'GET', url: '/api/licenca/estado' })).json();

const ATIVAR_ADMIN = { usuario: 'chefe', senha: SENHA, senhaMestre: SENHA_MESTRE_TESTE };

beforeEach(async () => {
  relogio = new Date('2026-11-14T12:00:00-03:00');
  await limparBanco(db);
  await criarUsuario(db, 'chefe', { role: 'ADMIN' });
  await criarUsuario(db, 'op');
});
afterAll(async () => {
  await db.$disconnect();
});

describe('Licença (plano de vigência)', () => {
  it('a chave oficial é derivável e diferente da de teste', async () => {
    expect(CHAVE_PUBLICA_LICENCA).toHaveLength(44);
    expect(CHAVE_PUBLICA_LICENCA).not.toBe(CHAVE_PUBLICA_TESTE);
    expect((await derivarChaves(SENHA_MESTRE_TESTE)).publica).toBe(CHAVE_PUBLICA_TESTE);
  });

  it('sem ativação: tudo bloqueado (423), exceto health, estado e ativação', async () => {
    const app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: true, motivo: 'NAO_ATIVADA' });
    const login = await req(app, null, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'chefe', password: SENHA },
    });
    expect(login.statusCode).toBe(423);
    expect(login.json()).toMatchObject({ codigo: 'LICENCA_BLOQUEADA' });
    expect((await req(app, null, { method: 'GET', url: '/api/clients' })).statusCode).toBe(423);
    expect((await req(app, null, { method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await app.close();
  });

  it('Admin ativa com usuário, senha e senha mestre; mensal vale até 14/12', async () => {
    const app = await criarApp();
    const r = await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      bloqueado: false,
      plano: 'MENSAL',
      inicio: '2026-11-14',
      vencimento: '2026-12-14',
      diasRestantes: 30,
      aviso: false,
      ativadoPor: 'chefe',
    });
    const cookie = await login(app, 'op');
    expect((await req(app, cookie, { method: 'GET', url: '/api/clients' })).statusCode).toBe(200);
    // Operacional não vê detalhes do plano.
    expect(await estado(app, cookie)).toEqual({ bloqueado: false, motivo: null, mensagem: null });
    const aud = await db.auditLog.findFirst({ where: { action: 'ATIVAR', entity: 'licenca' } });
    expect(aud?.username).toBe('chefe');
    expect(JSON.stringify(aud?.details)).not.toContain(SENHA_MESTRE_TESTE);
    await app.close();
  });

  it('recusa senha mestre errada, Admin errado e Operacional', async () => {
    const app = await criarApp();
    let r = await ativar(app, { ...ATIVAR_ADMIN, senhaMestre: 'outra-senha', plano: 'ANUAL' });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toBe('Senha mestre de ativação incorreta.');
    r = await ativar(app, { ...ATIVAR_ADMIN, senha: 'errada123', plano: 'ANUAL' });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toBe('Usuário ou senha do Admin inválidos.');
    r = await ativar(app, { ...ATIVAR_ADMIN, usuario: 'op', plano: 'ANUAL' });
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toBe('Somente um Admin pode ativar o sistema.');
    expect((await estado(app)).bloqueado).toBe(true);
    await app.close();
  });

  it('5 senhas mestre erradas bloqueiam a ativação por 15 minutos', async () => {
    const app = await criarApp();
    for (let i = 0; i < 5; i++) {
      await ativar(app, { ...ATIVAR_ADMIN, senhaMestre: `errada-${i}`, plano: 'MENSAL' });
    }
    const r = await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    expect(r.statusCode).toBe(423);
    expect(r.json().message).toContain('Ativação bloqueada');
    expect(await db.auditLog.count({ where: { action: 'ATIVACAO_FALHOU' } })).toBe(5);
    await app.close();
  });

  it('renovação antes de vencer soma ao que falta; vencida conta de hoje', async () => {
    let app = await criarApp();
    await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' }); // vence 14/12
    await app.close();

    relogio = new Date('2026-12-04T09:00:00-03:00');
    app = await criarApp();
    const admin = await login(app, 'chefe');
    expect(await estado(app, admin)).toMatchObject({ aviso: true, diasRestantes: 10 });
    // Admin logado renova só com a senha mestre.
    const r = await ativar(app, { senhaMestre: SENHA_MESTRE_TESTE, plano: 'TRIMESTRAL' }, admin);
    expect(r.json()).toMatchObject({ vencimento: '2027-03-14', inicio: '2026-12-04' });
    await app.close();

    relogio = new Date('2027-03-15T00:00:10-03:00');
    app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: true, motivo: 'VENCIDA' });
    expect((await ativar(app, { ...ATIVAR_ADMIN, plano: 'SEMESTRAL' })).json()).toMatchObject({
      bloqueado: false,
      vencimento: '2027-09-15',
    });
    await app.close();
  });

  it('licença alterada no banco é inválida', async () => {
    let app = await criarApp();
    await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    await app.close();
    const s = await db.setting.findUniqueOrThrow({ where: { key: CHAVES_LICENCA.licenca } });
    await db.setting.update({
      where: { key: CHAVES_LICENCA.licenca },
      data: { value: { ...(s.value as object), vencimento: '2099-12-31' } },
    });
    app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: true, motivo: 'INVALIDA' });
    await app.close();
  });

  it('licença copiada de outra instalação é inválida', async () => {
    let app = await criarApp();
    await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    await app.close();
    await db.setting.update({
      where: { key: CHAVES_LICENCA.instalacao },
      data: { value: 'outra-instalacao' },
    });
    app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: true, motivo: 'INVALIDA' });
    await app.close();
  });

  it('relógio do servidor atrasado de propósito bloqueia; reativar corrige', async () => {
    let app = await criarApp();
    await ativar(app, { ...ATIVAR_ADMIN, plano: 'ANUAL' });
    relogio = new Date('2027-02-01T12:00:00-03:00');
    await app.close();
    app = await criarApp();
    expect((await estado(app)).bloqueado).toBe(false); // grava o horário mais alto visto
    await app.close();

    relogio = new Date('2026-12-01T12:00:00-03:00'); // atrasaram o relógio
    app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: true, motivo: 'RELOGIO' });
    const r = await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    expect(r.json()).toMatchObject({ bloqueado: false, vencimento: '2027-12-14' });
    await app.close();
  });

  it('Vitalício: não vence, não avisa e não volta para plano com prazo', async () => {
    let app = await criarApp();
    const r = await ativar(app, { ...ATIVAR_ADMIN, plano: 'VITALICIO' });
    expect(r.json()).toMatchObject({ bloqueado: false, plano: 'VITALICIO', aviso: false });
    const volta = await ativar(app, { ...ATIVAR_ADMIN, plano: 'MENSAL' });
    expect(volta.statusCode).toBe(409);
    await app.close();

    relogio = new Date('2060-06-01T12:00:00-03:00');
    app = await criarApp();
    expect(await estado(app)).toMatchObject({ bloqueado: false });
    await app.close();
  });
});
