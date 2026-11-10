import type { Db } from '../db.js';
import { gerarSenhaTemporaria, hashSenha } from './password.js';

export type ResultadoRecuperacao =
  { ok: true; username: string; senhaTemporaria: string } | { ok: false; erro: string };

/**
 * Recuperação de acesso pela linha de comando do servidor (quem esqueceu a senha do Admin).
 * Gera uma senha temporária, exige a troca no próximo acesso, desbloqueia o usuário,
 * encerra as sessões abertas e registra na auditoria.
 * Só vale para Admin ativo: Operacional tem a senha redefinida pelo Admin, na tela de usuários.
 */
export async function recuperarAcessoAdmin(
  db: Db,
  username = 'admin',
): Promise<ResultadoRecuperacao> {
  const nome = username.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { username: { equals: nome, mode: 'insensitive' } },
  });

  if (!user || user.role !== 'ADMIN' || !user.active) {
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { username: true },
      orderBy: { username: 'asc' },
    });
    const lista = admins.map((a) => a.username).join(', ');
    const motivo = !user
      ? `Usuário "${nome}" não encontrado.`
      : user.role !== 'ADMIN'
        ? `"${user.username}" não é Admin. A senha de usuários Operacionais é redefinida pelo Admin, na tela de usuários.`
        : `"${user.username}" está desativado.`;
    return {
      ok: false,
      erro: lista
        ? `${motivo} Admins ativos: ${lista}.`
        : `${motivo} Nenhum Admin ativo encontrado.`,
    };
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashSenha(senhaTemporaria),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({
      data: {
        action: 'SENHA_REDEFINIDA',
        entity: 'usuario',
        entityId: user.id,
        username: 'linha de comando do servidor',
        details: { username: user.username, origem: 'recuperação de acesso' },
      },
    }),
  ]);
  return { ok: true, username: user.username, senhaTemporaria };
}
