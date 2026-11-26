import { EMPRESA_PADRAO } from '@jat/core';
import { useLicenca } from './licenca';

/** Usuário e senha da edição de demonstração (mostrados na tela de login da demo). */
export const LOGIN_DEMO = { usuario: 'visitante', senha: 'quote2026' } as const;
export const EMPRESA_DEMO = 'Transportadora Exemplo';

/**
 * Edição do sistema (25/11/2026): 'completa' (JAT) ou 'demo' (dados fictícios, só a marca Quote).
 * Vem do servidor junto com o estado da licença, antes do login.
 * `conhecida` = false enquanto o servidor ainda não respondeu (não mostra a marca da JAT).
 */
export function useEdicao() {
  const { data } = useLicenca();
  const demo = data?.demo === true;
  return {
    demo,
    conhecida: data !== undefined,
    produto: demo ? 'Quote' : 'JAT Quote',
    empresa: demo ? EMPRESA_DEMO : EMPRESA_PADRAO,
  };
}
