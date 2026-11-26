/**
 * Popula o banco da EDIÇÃO DE DEMONSTRAÇÃO com dados fictícios (apaga tudo antes!).
 * Só roda com EDICAO=demo no .env — nunca no sistema real.
 *
 *   npm run db:demo -w @jat/api
 */
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { popularDemo, SENHA_DEMO, USUARIO_DEMO } from './lib/demo.js';

const env = loadEnv();
if (env.EDICAO !== 'demo') {
  console.error(
    'Recusado: este comando apaga o banco. Ele só roda na edição de demonstração (EDICAO=demo).',
  );
  process.exit(1);
}
const db = createDb(env.DATABASE_URL);
try {
  // Atualização do instalador: não apaga uma demonstração que já existe.
  if (process.argv.includes('--se-vazio') && (await db.user.count()) > 0) {
    console.log('  A demonstração já existe: nada a fazer.');
    process.exit(0);
  }
  const { cotacoes } = await popularDemo(db);
  console.log('');
  console.log(`  Demonstração pronta: ${cotacoes} cotações fictícias.`);
  console.log(`  Usuário: ${USUARIO_DEMO}`);
  console.log(`  Senha: ${SENHA_DEMO}`);
  console.log('');
} finally {
  await db.$disconnect();
}
