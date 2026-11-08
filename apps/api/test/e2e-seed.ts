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
} finally {
  await db.$disconnect();
}
