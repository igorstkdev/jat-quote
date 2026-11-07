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
} finally {
  await db.$disconnect();
}
