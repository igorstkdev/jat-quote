import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, ApiError, definirAoPerderSessao, type UsuarioSessao } from './api';

export const CHAVE_ME = ['auth', 'me'] as const;

/** Usuário logado (null = não logado). */
export function useMe() {
  return useQuery({
    queryKey: CHAVE_ME,
    queryFn: async () => {
      try {
        return (await api.get<{ user: UsuarioSessao }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Liga o "sessão expirou" da API ao cache do usuário. Montado uma vez na raiz. */
export function SessaoWatcher() {
  const qc = useQueryClient();
  useEffect(() => {
    definirAoPerderSessao(() => qc.setQueryData(CHAVE_ME, null));
    return () => definirAoPerderSessao(null);
  }, [qc]);
  return null;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { username: string; password: string }) =>
      api.post<{ user: UsuarioSessao }>('/api/auth/login', dados),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(CHAVE_ME, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(CHAVE_ME, null);
    },
  });
}

export function useTrocarSenha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { currentPassword: string; newPassword: string }) =>
      api.post<{ user: UsuarioSessao }>('/api/auth/change-password', dados),
    onSuccess: ({ user }) => qc.setQueryData(CHAVE_ME, user),
  });
}

export const ehAdmin = (u: UsuarioSessao | null | undefined) => u?.role === 'ADMIN';

/** Mesma regra do servidor (CLAUDE.md §3.9 / Fase 2). */
export function regrasSenha(senha: string) {
  return [
    { ok: senha.length >= 8, texto: 'Pelo menos 8 caracteres' },
    { ok: /[A-Za-zÀ-ÿ]/.test(senha), texto: 'Letras' },
    { ok: /\d/.test(senha), texto: 'Números' },
  ];
}
