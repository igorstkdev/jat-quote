/**
 * Recupera o acesso de um Admin que esqueceu a senha. Roda no servidor:
 *
 *   npm run admin:recuperar-acesso              (usuário "admin")
 *   npm run admin:recuperar-acesso -- maria     (outro Admin)
 */
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { recuperarAcessoAdmin } from './lib/recuperar-acesso.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
try {
  const r = await recuperarAcessoAdmin(db, process.argv[2]);
  console.log('');
  if (r.ok) {
    console.log('  Acesso recuperado.');
    console.log(`  Usuário: ${r.username}`);
    console.log(`  Senha temporária: ${r.senhaTemporaria}`);
    console.log(
      '  Anote agora: ela não será mostrada de novo. A troca é obrigatória no próximo acesso.',
    );
    console.log(
      '  As sessões abertas desse usuário foram encerradas e o bloqueio por tentativas, removido.',
    );
  } else {
    console.log(`  ${r.erro}`);
    process.exitCode = 1;
  }
  console.log('');
} finally {
  await db.$disconnect();
}
