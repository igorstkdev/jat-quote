/**
 * Seed do JAT Quote: cria o Admin inicial, as configurações padrão e os links úteis.
 * Pode rodar mais de uma vez: só cria o que ainda não existe.
 *
 *   npm run db:seed                 (Admin "admin")
 *   npm run db:seed -- maria.souza  (Admin com outro login)
 */
import { AD_VALOREM_PADRAO } from '@jat/core';
import type { Db } from './db.js';
import { gerarSenhaTemporaria, hashSenha } from './lib/password.js';
import { CHAVES, CONDICOES_FTL_PADRAO } from './lib/settings.js';
import { usernameSchema } from './lib/usuarios.js';

export const LINKS_INICIAIS = [
  { name: 'Qualp', url: 'https://qualp.com.br/#/' },
  { name: 'Google Maps', url: 'https://www.google.com/maps' },
] as const;

export async function seed(
  db: Db,
  opcoes: { adminUsername?: string } = {},
): Promise<{ senhaAdmin: string | null; adminUsername: string }> {
  const adminUsername = usernameSchema.parse(opcoes.adminUsername ?? 'admin');
  let senhaAdmin: string | null = null;
  const temAdmin = await db.user.count({ where: { role: 'ADMIN' } });
  if (temAdmin === 0) {
    senhaAdmin = gerarSenhaTemporaria();
    await db.user.create({
      data: {
        username: adminUsername,
        name: 'Administrador',
        role: 'ADMIN',
        canEditRates: true,
        passwordHash: await hashSenha(senhaAdmin),
        mustChangePassword: true,
      },
    });
  }

  await db.setting.upsert({
    where: { key: CHAVES.adValorem },
    create: { key: CHAVES.adValorem, value: { ...AD_VALOREM_PADRAO } },
    update: {},
  });
  await db.setting.upsert({
    where: { key: CHAVES.condicoesFtl },
    create: { key: CHAVES.condicoesFtl, value: CONDICOES_FTL_PADRAO },
    update: {},
  });

  if ((await db.usefulLink.count()) === 0) {
    await db.usefulLink.createMany({
      data: LINKS_INICIAIS.map((l, i) => ({ ...l, sortOrder: i + 1 })),
    });
  }

  return { senhaAdmin, adminUsername };
}
