import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dadosPdf, verificarRecursosPdf } from '../src/lib/pdf.js';
import { htmlCotacaoCliente, htmlCotacaoOperacao } from '../src/lib/pdf-templates.js';
import { termosGravados } from '../src/lib/quotes.js';
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
let oper2: string;
let clienteId: string;

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
  await criarUsuario(db, 'oper2');
  admin = await login(app, 'chefe');
  oper = await login(app, 'oper');
  oper2 = await login(app, 'oper2');
  clienteId = (await db.client.create({ data: { name: 'Fiat', email: 'logistica@fiat.com.br' } }))
    .id;
});

const aereo = () => ({
  clientId: clienteId,
  originCity: 'sao paulo',
  originUf: 'sp',
  destCity: 'Feira De Santana',
  destUf: 'BA',
  modal: 'AEREO',
  costs: { COLETA: '300', AEREO: '600,00', ENTREGA: 150 },
  toll: '150',
  markupPct: '70',
  notes: 'Coleta até 17h.',
});

const salvar = (cookie: string, payload: object) =>
  req(app, cookie, { method: 'POST', url: '/api/quotes', payload });

describe('cotação Spot: salvar', () => {
  it('servidor recalcula, padroniza cidades (IBGE), numera e começa Pendente', async () => {
    const res = await salvar(oper, { ...aereo(), total: '1' }); // total do navegador é ignorado
    expect(res.statusCode).toBe(201);
    const q = res.json().quote;
    expect(q).toMatchObject({
      number: 1,
      code: 'JQ-000001',
      status: 'PENDENTE',
      modal: 'AEREO',
      clientName: 'Fiat',
      clientEmail: 'logistica@fiat.com.br',
      origin: 'São Paulo, SP',
      dest: 'Feira de Santana, BA',
      costs: { COLETA: '300', AEREO: '600', ENTREGA: '150', RODOVIARIO: null },
      costTotal: '1050',
      markupTotal: '735',
      subtotal: '1785',
      toll: '150',
      total: '1935',
      adValoremPct: '0.47',
      createdBy: { username: 'oper' },
    });
    const h = await db.quoteStatusChange.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDENTE' });
    expect(await db.auditLog.count({ where: { entity: 'cotacao', action: 'CRIAR' } })).toBe(1);
    const q2 = (await salvar(oper, aereo())).json().quote;
    expect(q2.code).toBe('JQ-000002');
  });

  it('rodoviário com ad valorem padrão configurado pelo Admin', async () => {
    await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/ad-valorem',
      payload: { AEREO: '0.47', RODOVIARIO: '0,2' },
    });
    const q = (
      await salvar(oper, {
        ...aereo(),
        modal: 'RODOVIARIO',
        costs: { RODOVIARIO: '350', COLETA: '999' },
        markupPct: '70',
        toll: '150',
        goodsValue: '10.000,00',
      })
    ).json().quote;
    expect(q).toMatchObject({
      total: '745',
      markupTotal: '245',
      subtotal: '595',
      adValoremPct: '0.2',
      goodsValue: '10000',
    });
    expect(q.costs).toEqual({ RODOVIARIO: '350', COLETA: null, AEREO: null, ENTREGA: null });
  });

  it('validações em português', async () => {
    const r1 = await salvar(oper, { ...aereo(), destCity: 'Cidade Inventada' });
    expect(r1.statusCode).toBe(400);
    expect(r1.json()).toMatchObject({
      message: 'Destino: "Cidade Inventada/BA" não está na lista de municípios do IBGE.',
      campo: 'destCity',
    });
    const r2 = await salvar(oper, { ...aereo(), markupPct: '-5' });
    expect(r2.json()).toMatchObject({
      message: 'O markup não pode ser negativo.',
      campo: 'markupPct',
    });
    const r3 = await salvar(oper, { ...aereo(), clientId: undefined });
    expect(r3.json().message).toBe('Selecione o cliente.');
    const r4 = await salvar(oper, { ...aereo(), costs: { AEREO: 'abc' } });
    expect(r4.json().campo).toBe('custos.AEREO');
    await db.client.update({ where: { id: clienteId }, data: { active: false } });
    const r5 = await salvar(oper, aereo());
    expect(r5.json().message).toBe('Este cliente está desativado. Escolha outro.');
  });

  it('exige login', async () => {
    expect((await salvar('', aereo())).statusCode).toBe(401);
  });
});

describe('cotação Spot: editar, bloqueio da Aprovada e duplicar', () => {
  it('outro operador pode editar; auditoria guarda o antes e depois', async () => {
    const q = (await salvar(oper, aereo())).json().quote;
    const res = await req(app, oper2, {
      method: 'PATCH',
      url: `/api/quotes/${q.id}`,
      payload: { ...aereo(), markupPct: '50' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().quote).toMatchObject({ total: '1725', updatedBy: { username: 'oper2' } });
    const log = await db.auditLog.findFirst({ where: { entity: 'cotacao', action: 'EDITAR' } });
    expect(log?.details).toMatchObject({
      numero: 1,
      markupPct: { de: '70', para: '50' },
      total: { de: '1935', para: '1725' },
    });
  });

  it('cotação aprovada não pode ser editada; duplicar cria nova Pendente', async () => {
    const q = (await salvar(oper, aereo())).json().quote;
    await db.quote.update({ where: { id: q.id }, data: { status: 'APROVADA' } });
    const ed = await req(app, oper, {
      method: 'PATCH',
      url: `/api/quotes/${q.id}`,
      payload: aereo(),
    });
    expect(ed.statusCode).toBe(409);
    expect(ed.json().message).toContain('Cotação aprovada não pode ser editada');

    const dup = await req(app, oper2, { method: 'POST', url: `/api/quotes/${q.id}/duplicate` });
    expect(dup.statusCode).toBe(201);
    expect(dup.json().quote).toMatchObject({
      code: 'JQ-000002',
      status: 'PENDENTE',
      total: '1935',
      duplicatedFromId: q.id,
      createdBy: { username: 'oper2' },
    });
  });

  it('cliente desativado depois da cotação: edição mantém o mesmo cliente', async () => {
    const q = (await salvar(oper, aereo())).json().quote;
    await db.client.update({ where: { id: clienteId }, data: { active: false } });
    const ed = await req(app, oper, {
      method: 'PATCH',
      url: `/api/quotes/${q.id}`,
      payload: { ...aereo(), toll: '0' },
    });
    expect(ed.statusCode).toBe(200);
  });

  it('lista recentes, busca por número/cliente e ignora excluídas', async () => {
    const a = (await salvar(oper, aereo())).json().quote;
    await salvar(oper2, { ...aereo(), destCity: 'Salvador' });
    await db.quote.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    const todas = (await req(app, oper, { method: 'GET', url: '/api/quotes' })).json().quotes;
    expect(todas.map((q: { code: string }) => q.code)).toEqual(['JQ-000002']);
    const minhas = (await req(app, oper, { method: 'GET', url: '/api/quotes?mine=1' })).json()
      .quotes;
    expect(minhas).toHaveLength(0);
    const busca = (
      await req(app, oper, { method: 'GET', url: '/api/quotes?search=JQ-000002' })
    ).json().quotes;
    expect(busca).toHaveLength(1);
    expect((await req(app, oper, { method: 'GET', url: `/api/quotes/${a.id}` })).statusCode).toBe(
      404,
    );
  });
});

describe('termos e condições (17/11/2026)', () => {
  it('ficam gravados ao salvar e não mudam quando o Admin edita as Configurações', async () => {
    const salva = (await salvar(oper, aereo())).json().quote;
    expect(salva.terms.formato).toBe('TOPICOS');
    expect(salva.terms.topicos).toContain('ICMS e seguro a incluir.');

    await req(app, admin, {
      method: 'PUT',
      url: '/api/settings/spot-conditions',
      payload: {
        conditions: {
          RODOVIARIO: { formato: 'TEXTO', topicos: [], texto: 'Termo rodoviário novo.' },
          AEREO: { formato: 'TOPICOS', topicos: ['Termo aéreo novo.'], texto: '' },
        },
      },
    });
    const lida = (await req(app, oper, { method: 'GET', url: `/api/quotes/${salva.id}` })).json()
      .quote;
    expect(lida.terms.topicos).toContain('ICMS e seguro a incluir.');

    // Duplicar como nova = nova cotação, com os termos atuais.
    const dup = (
      await req(app, oper, { method: 'POST', url: `/api/quotes/${salva.id}/duplicate` })
    ).json().quote;
    expect(dup.terms.topicos).toEqual(['Termo aéreo novo.']);
  });
});

describe('PDF', () => {
  it('visão do cliente: sem custos internos, com validade de 30 dias', async () => {
    await salvar(oper, aereo());
    const q = await db.quote.findFirstOrThrow({ include: { createdBy: true } });
    const html = htmlCotacaoCliente(dadosPdf(q, 'Fulano <b>', termosGravados(q)));
    expect(html).toContain('JQ-000001');
    expect(html).toContain('R$ 1.935,00');
    expect(html).toContain('Feira de Santana, BA');
    expect(html).toContain('Validade da cotação: 30 dias');
    expect(html).toContain('Termos e condições');
    expect(html).toContain('ICMS e seguro a incluir.');
    expect(html).toContain(
      'Ad valorem de 0,47% sobre o valor da nota fiscal, cobrado adicionalmente.',
    );
    expect(html).not.toMatch(/MKUP|Custo base|R\$ 300,00/);
    expect(html).toContain('Fulano &lt;b&gt;'); // escapa HTML
    expect(html).toContain('data:image/png;base64,');
  });

  it('visão da operação: detalhamento igual ao app atual', async () => {
    await salvar(oper, aereo());
    const q = await db.quote.findFirstOrThrow({ include: { createdBy: true } });
    const html = htmlCotacaoOperacao(dadosPdf(q, 'X', termosGravados(q)));
    for (const t of [
      'Transporte aéreo',
      'Custo base',
      '+ MKUP (70%)',
      'R$ 210,00',
      'R$ 510,00',
      'R$ 1.020,00',
      'R$ 735,00',
      'R$ 1.785,00',
      'R$ 150,00',
      'R$ 1.935,00',
      'USO INTERNO',
    ]) {
      expect(html, t).toContain(t);
    }
  });

  it('gera o arquivo PDF pelo Chromium', async () => {
    const q = (await salvar(oper, aereo())).json().quote;
    const res = await req(app, oper, {
      method: 'GET',
      url: `/api/quotes/${q.id}/pdf?visao=operacao`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('cotacao-JQ-000001-operacao.pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.length).toBeGreaterThan(10_000);
  }, 30_000);

  it('vários PDFs ao mesmo tempo (cliente e operação) saem todos (fila de 2)', async () => {
    const q = (await salvar(oper, aereo())).json().quote;
    const pedidos = ['cliente', 'operacao', 'cliente', 'operacao', 'cliente'].map((v) =>
      req(app, oper, { method: 'GET', url: `/api/quotes/${q.id}/pdf?visao=${v}` }),
    );
    for (const r of await Promise.all(pedidos)) {
      expect(r.statusCode).toBe(200);
      expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    }
  }, 60_000);

  it('sem o arquivo da logo, o PDF sai com o nome da marca em vez de falhar', async () => {
    await salvar(oper, aereo());
    const q = await db.quote.findFirstOrThrow({ include: { createdBy: true } });
    const html = htmlCotacaoCliente({ ...dadosPdf(q, 'X', termosGravados(q)), logoDataUrl: '' });
    expect(html).not.toContain('<img');
    expect(html).toContain('<div class="marca">JAT Transportes e Logística S/A</div>');
  });

  it('erro ao abrir o PDF numa aba mostra página em português, não JSON', async () => {
    const res = await req(app, oper, {
      method: 'GET',
      url: '/api/quotes/00000000-0000-4000-8000-000000000000/pdf?visao=cliente',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Cotação não encontrada.');
    // Pedidos da própria tela (fetch) continuam recebendo JSON.
    const json = await req(app, oper, {
      method: 'GET',
      url: '/api/quotes/00000000-0000-4000-8000-000000000000',
    });
    expect(json.json().message).toBe('Cotação não encontrada.');
  });

  it('recursos do PDF conferidos (logo e Chromium) e informados no /api/health', async () => {
    expect(verificarRecursosPdf()).toEqual([]);
    const h = (await req(app, null, { method: 'GET', url: '/api/health' })).json();
    expect(h.pdf).toEqual({ ok: true, problemas: [] });
  });
});
