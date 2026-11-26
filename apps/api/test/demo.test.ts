import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { popularDemo, SENHA_DEMO, USUARIO_DEMO } from '../src/lib/demo.js';
import { dadosPdf, MARCA_DEMO } from '../src/lib/pdf.js';
import { htmlCotacaoCliente } from '../src/lib/pdf-templates.js';
import { termosGravados } from '../src/lib/quotes.js';
import { CHAVE_PUBLICA_TESTE } from './licenca-teste.js';
import { criarDbTeste, login, req } from './helpers.js';

const db = criarDbTeste();
let demo: Awaited<ReturnType<typeof buildApp>>;
let real: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  await popularDemo(db);
  demo = await buildApp({ db, webDist: '__x__', loginRateLimit: 10_000, edicao: 'demo' });
  // Sistema real com licença ligada (e sem licença ativada no banco da demo).
  real = await buildApp({
    db,
    webDist: '__x__',
    loginRateLimit: 10_000,
    licenca: { chavePublica: CHAVE_PUBLICA_TESTE },
  });
}, 120_000);
afterAll(async () => {
  await demo.close();
  await real.close();
  await db.$disconnect();
});

describe('edição de demonstração', () => {
  it('dados fictícios completos e coerentes', async () => {
    const cotacoes = await db.quote.findMany();
    expect(cotacoes.length).toBe(165);
    expect(await db.client.count()).toBe(24);
    expect(await db.ftlRate.count()).toBe(54); // 27 UFs × capital/interior
    expect(await db.airRate.count()).toBeGreaterThan(15);
    const status = new Set(cotacoes.map((q) => q.status));
    expect([...status].sort()).toEqual(['APROVADA', 'DECLINADA', 'PENDENTE', 'RECUSADA']);
    expect(new Set(cotacoes.map((q) => q.modal))).toEqual(new Set(['AEREO', 'RODOVIARIO', 'FTL']));
    // A lógica bate: total = subtotal + pedágio; subtotal = custos × (1 + markup).
    for (const q of cotacoes.filter((x) => x.modal !== 'FTL')) {
      expect(q.subtotal.plus(q.toll).toString()).toBe(q.total.toString());
      expect(q.costTotal.plus(q.markupTotal).toString()).toBe(q.subtotal.toString());
    }
    // Nenhum dado da JAT.
    const nomes = (await db.client.findMany()).map((c) => c.name).join(' ');
    expect(nomes).not.toMatch(/JAT|Fiat/i);
  });

  it('não tem licença: nunca bloqueia e informa "demo" ao navegador', async () => {
    const e = (await req(demo, null, { method: 'GET', url: '/api/licenca/estado' })).json();
    expect(e).toEqual({ bloqueado: false, motivo: null, mensagem: null, demo: true });
    // O mesmo banco no sistema real ficaria bloqueado (sem licença): a demo é outra coisa.
    expect(
      (await req(real, null, { method: 'GET', url: '/api/licenca/estado' })).json().bloqueado,
    ).toBe(true);
    const ativar = await req(demo, null, {
      method: 'POST',
      url: '/api/licenca/ativar',
      payload: { senhaMestre: 'x', plano: 'ANUAL' },
    });
    expect(ativar.statusCode).toBe(400);
  });

  it('login do visitante com a senha fixa e PDF com a marca Quote', async () => {
    const cookie = await login(demo, USUARIO_DEMO, SENHA_DEMO);
    expect((await req(demo, cookie, { method: 'GET', url: '/api/clients' })).statusCode).toBe(200);
    const q = await db.quote.findFirstOrThrow({
      where: { modal: 'AEREO' },
      include: { createdBy: true },
    });
    const html = htmlCotacaoCliente(dadosPdf(q, 'Visitante', termosGravados(q), MARCA_DEMO));
    expect(html).toContain('Transportadora Exemplo');
    expect(html).toContain('Gerado pelo Quote');
    expect(html).not.toMatch(/JAT/);
  });

  it('Restaurar demo: confirmação forte, só Admin e só na demo', async () => {
    const cookie = await login(demo, USUARIO_DEMO, SENHA_DEMO);
    await db.client.create({ data: { name: 'Cliente criado na apresentação' } });
    const sem = await req(demo, cookie, {
      method: 'POST',
      url: '/api/demo/restaurar',
      payload: { confirmation: 'sim' },
    });
    expect(sem.statusCode).toBe(400);
    const ok = await req(demo, cookie, {
      method: 'POST',
      url: '/api/demo/restaurar',
      payload: { confirmation: 'restaurar demo' },
    });
    expect(ok.json()).toEqual({ status: 'ok', cotacoes: 165 });
    expect(await db.client.count({ where: { name: 'Cliente criado na apresentação' } })).toBe(0);
    // No sistema real a rota nem existe.
    expect(
      (await req(real, null, { method: 'POST', url: '/api/demo/restaurar', payload: {} }))
        .statusCode,
    ).not.toBe(200);
  }, 120_000);
});
