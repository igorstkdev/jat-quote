import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

/** Política de senha (confirmada na Fase 2): mínimo 8 caracteres, com letras e números. */
export function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (senha.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) {
    return 'A senha deve ter letras e números.';
  }
  return null;
}

export function hashSenha(senha: string): Promise<string> {
  return argon2.hash(senha, { type: argon2.argon2id });
}

export async function verificarSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    return false;
  }
}

/** Hash fixo para gastar o mesmo tempo quando o usuário não existe (evita enumerar usuários). */
let hashFalso: Promise<string> | undefined;
export function hashParaUsuarioInexistente(): Promise<string> {
  hashFalso ??= hashSenha('usuario-inexistente-0');
  return hashFalso;
}

const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Senha temporária legível (sem 0/O/1/l/I), sempre com letras e números. */
export function gerarSenhaTemporaria(tamanho = 12): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
    if (validarSenha(s) === null) return s;
  }
}
