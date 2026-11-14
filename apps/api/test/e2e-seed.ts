/**
 * Prepara o banco de TESTE para os testes E2E (Playwright).
 * Usuários de teste (credenciais só deste banco de teste):
 *   admin.e2e / E2eSenha123  (Admin)
 *   oper.e2e  / E2eSenha123  (Operacional, troca de senha obrigatória)
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashSenha } from '../src/lib/password.js';
import { seed } from '../src/seed.js';
import { criarDbTeste, limparBanco } from './helpers.js';
import { criarControleLicenca } from '../src/lib/licenca.js';
import { CHAVE_PUBLICA_TESTE, SENHA_MESTRE_TESTE } from './licenca-teste.js';

export const SENHA_E2E = 'E2eSenha123';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL não definida.');

execSync('npx prisma migrate deploy', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'ignore',
});

const db = criarDbTeste();
try {
  await limparBanco(db);
  const hash = await hashSenha(SENHA_E2E);
  await db.user.createMany({
    data: [
      {
        username: 'admin.e2e',
        name: 'Ana Admin',
        role: 'ADMIN',
        canEditRates: true,
        passwordHash: hash,
        mustChangePassword: false,
      },
      {
        username: 'oper.e2e',
        name: 'Otávio Operador',
        role: 'OPERACIONAL',
        passwordHash: hash,
        mustChangePassword: true,
      },
      {
        username: 'bruno.lima',
        name: 'Bruno Lima',
        role: 'OPERACIONAL',
        canEditRates: true,
        passwordHash: hash,
        mustChangePassword: false,
        lastLoginAt: new Date(),
      },
    ],
  });
  await seed(db);
  await db.client.createMany({
    data: [
      {
        name: 'Fiat Automóveis S.A.',
        document: '16701716000156',
        contact: 'Fernanda Souza',
        email: 'logistica@fiat.com.br',
        phone: '(31) 2123-4000',
      },
      {
        name: 'Bosch Ltda.',
        document: '45990181000189',
        contact: 'Ricardo Alves',
        email: 'compras@bosch.com.br',
        phone: '(19) 2103-1000',
      },
      { name: 'Magazine Exemplo', contact: 'Juliana Prado', email: 'juliana@exemplo.com.br' },
      { name: 'Transportadora Antiga', active: false, notes: 'Contrato encerrado em 2025.' },
    ],
  });

  // Tarifas aéreas de exemplo (Fase 4)
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  type N = [string, string] | null;
  const tarifa = (
    origin: string,
    destination: string,
    airline: 'GOL' | 'AZUL' | 'LATAM',
    u: N,
    r: N,
    e: N,
    extra: { validFrom?: string; validTo?: string; active?: boolean; notes?: string } = {},
  ) => ({
    origin,
    destination,
    airline,
    validFrom: d(extra.validFrom ?? '2026-01-01'),
    validTo: extra.validTo ? d(extra.validTo) : null,
    active: extra.active ?? true,
    notes: extra.notes ?? null,
    urgentPerKg: u?.[0] ?? null,
    urgentMin: u?.[1] ?? null,
    fastPerKg: r?.[0] ?? null,
    fastMin: r?.[1] ?? null,
    economyPerKg: e?.[0] ?? null,
    economyMin: e?.[1] ?? null,
  });
  await db.airRate.createMany({
    data: [
      tarifa('GRU', 'SSA', 'GOL', ['12.5', '150'], ['9.8', '120'], null),
      tarifa('GRU', 'SSA', 'AZUL', ['10', '300'], ['9.5', '110'], ['7.2', '90']),
      tarifa('GRU', 'SSA', 'LATAM', ['11', '100'], null, ['6.9', '95']),
      tarifa('GRU', 'REC', 'GOL', ['13.2', '160'], ['10.5', '130'], ['7.9', '100']),
      tarifa('GRU', 'REC', 'LATAM', ['12.9', '150'], null, null, { notes: 'Acordo 2026' }),
      tarifa('GRU', 'BSB', 'LATAM', ['10.7', '120'], ['8.6', '100'], null),
      tarifa('CGH', 'POA', 'AZUL', ['9.4', '140'], null, null, { active: false }),
      tarifa('VCP', 'MAO', 'AZUL', ['18.4', '250'], ['14.9', '200'], ['11.2', '160'], {
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
      }),
      tarifa('VCP', 'MAO', 'AZUL', ['19.1', '260'], ['15.4', '210'], ['11.6', '170']),
    ],
  });

  // Tabelas FTL de exemplo (inclui o caso real SP Capital VAN R$ 3,60/km)
  const ftl = (
    uf: string,
    region: string,
    locality: 'CAPITAL' | 'INTERIOR',
    [u, v, t]: [string, string, string],
    adValoremPct: string,
    active = true,
  ) => ({
    uf,
    region,
    locality,
    perKmUtility: u,
    perKmVan: v,
    perKm15t: t,
    adValoremPct,
    active,
  });
  await db.ftlRate.createMany({
    data: [
      ftl('SP', 'Sudeste', 'CAPITAL', ['2.9', '3.6', '4.5'], '0.5'),
      ftl('SP', 'Sudeste', 'INTERIOR', ['2.7', '3.3', '4.2'], '0.5'),
      ftl('MG', 'Sudeste', 'CAPITAL', ['3', '3.8', '4.7'], '0.5'),
      ftl('MG', 'Sudeste', 'INTERIOR', ['2.8', '3.5', '4.4'], '0.5'),
      ftl('RJ', 'Sudeste', 'CAPITAL', ['3.1', '3.9', '4.8'], '0.5'),
      ftl('BA', 'Nordeste', 'CAPITAL', ['3.4', '4.2', '5.1'], '0.7'),
      ftl('PR', 'Sul', 'CAPITAL', ['3.05', '3.75', '4.65'], '0.5', false),
    ],
  });

  // Cotações de exemplo (Fase 5): Spot e FTL nos últimos 6 meses, para Relatório e Dashboard.
  const [admin, bruno] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { username: 'admin.e2e' } }),
    db.user.findUniqueOrThrow({ where: { username: 'bruno.lima' } }),
  ]);
  const clientes = await db.client.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  const sp = await db.ftlRate.findFirstOrThrow({ where: { uf: 'SP', locality: 'CAPITAL' } });
  const rotas = [
    ['São Paulo', 'SP', 'Salvador', 'BA'],
    ['Campinas', 'SP', 'Recife', 'PE'],
    ['Belo Horizonte', 'MG', 'Curitiba', 'PR'],
    ['São Paulo', 'SP', 'Manaus', 'AM'],
    ['Betim', 'MG', 'Rio de Janeiro', 'RJ'],
    ['Guarulhos', 'SP', 'Fortaleza', 'CE'],
  ] as const;
  const status = ['APROVADA', 'PENDENTE', 'DECLINADA', 'APROVADA', 'RECUSADA', 'PENDENTE'] as const;
  const agora = Date.now();
  const dia = 86_400_000;
  const c2 = (n: number) => n.toFixed(2);
  for (let i = 0; i < 26; i++) {
    const aereo = i % 3 === 0;
    const [oc, ou, dc, du] = rotas[i % 4 === 3 ? 0 : (i * 7) % rotas.length]!;
    const custo = 300 + ((i * 137) % 900);
    const markup = [30, 45, 70][i % 3]!;
    const pedagio = aereo ? 0 : 50 + ((i * 31) % 150);
    const mkup = (custo * markup) / 100;
    const st = status[i % status.length]!;
    const criada = new Date(agora - Math.round(i * 6.7 * dia) - (2 + (i % 5)) * 3_600_000);
    const autor = i % 2 ? bruno.id : admin.id;
    const q = await db.quote.create({
      data: {
        modal: aereo ? 'AEREO' : 'RODOVIARIO',
        status: st,
        clientId: clientes[i % clientes.length]!.id,
        clientName: clientes[i % clientes.length]!.name,
        originCity: oc,
        originUf: ou,
        destCity: dc,
        destUf: du,
        ...(aereo
          ? { costPickup: c2(custo * 0.2), costAir: c2(custo * 0.6), costDelivery: c2(custo * 0.2) }
          : { costRoad: c2(custo) }),
        toll: c2(pedagio),
        markupPct: String(markup),
        adValoremPct: aereo ? '0.47' : '0.15',
        costTotal: c2(custo),
        markupTotal: c2(mkup),
        subtotal: c2(custo + mkup),
        total: c2(custo + mkup + pedagio),
        notes: i === 0 ? 'Coleta agendada para 8h.' : null,
        createdById: autor,
        createdAt: criada,
        updatedAt: criada,
      },
    });
    await db.quoteStatusChange.create({
      data: { quoteId: q.id, toStatus: 'PENDENTE', userId: autor, at: criada },
    });
    if (st !== 'PENDENTE') {
      await db.quoteStatusChange.create({
        data: {
          quoteId: q.id,
          fromStatus: 'PENDENTE',
          toStatus: st,
          userId: admin.id,
          at: new Date(criada.getTime() + 3_600_000),
        },
      });
    }
  }
  for (const [i, km] of [180, 420, 95, 310].entries()) {
    const criada = new Date(agora - (i * 23 + 2) * dia);
    const total = c2(km * 3.6);
    const q = await db.quote.create({
      data: {
        modal: 'FTL',
        status: i % 2 ? 'APROVADA' : 'PENDENTE',
        destUf: 'SP',
        ftlRateId: sp.id,
        ftlRateVersion: sp.version,
        ftlLocality: 'CAPITAL',
        vehicle: 'VAN',
        distanceKm: String(km),
        ratePerKm: '3.6',
        adValoremPct: '0.5',
        costTotal: total,
        subtotal: total,
        total,
        createdById: admin.id,
        createdAt: criada,
        updatedAt: criada,
      },
    });
    await db.quoteStatusChange.create({
      data: { quoteId: q.id, toStatus: 'PENDENTE', userId: admin.id, at: criada },
    });
  }

  // Licença de teste (o servidor do E2E usa a chave pública de teste).
  await criarControleLicenca(db, CHAVE_PUBLICA_TESTE).ativar(SENHA_MESTRE_TESTE, 'ANUAL', 'admin');
} finally {
  await db.$disconnect();
}
