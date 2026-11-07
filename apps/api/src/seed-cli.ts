import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { seed } from './seed.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
try {
  const { senhaAdmin } = await seed(db);
  if (senhaAdmin) {
    console.log('');
    console.log('  Admin inicial criado.');
    console.log('  Usuário: admin');
    console.log(`  Senha temporária: ${senhaAdmin}`);
    console.log(
      '  Anote agora: ela não será mostrada de novo. A troca é obrigatória no 1º acesso.',
    );
    console.log('');
  } else {
    console.log('');
    console.log('  Já existe um Admin. Nada a criar (configurações e links conferidos).');
    console.log('');
  }
} finally {
  await db.$disconnect();
}
