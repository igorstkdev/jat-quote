import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanoLicenca } from '@jat/core';
import { api } from './api';

export const CHAVE_LICENCA = ['licenca'] as const;

export type MotivoBloqueio = 'NAO_ATIVADA' | 'VENCIDA' | 'INVALIDA' | 'RELOGIO';

export interface EstadoLicenca {
  bloqueado: boolean;
  motivo: MotivoBloqueio | null;
  mensagem: string | null;
  // Só para Admin logado:
  plano?: PlanoLicenca;
  inicio?: string;
  vencimento?: string;
  ativadoPor?: string;
  ativadoEm?: string;
  diasRestantes?: number | null;
  aviso?: boolean;
}

export interface DadosAtivacao {
  usuario?: string;
  senha?: string;
  senhaMestre: string;
  plano: PlanoLicenca;
}

/** Estado da licença. Reconsulta a cada 5 min para bloquear quando vencer com a tela aberta. */
export function useLicenca() {
  return useQuery({
    queryKey: CHAVE_LICENCA,
    queryFn: () => api.get<EstadoLicenca>('/api/licenca/estado'),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useAtivarLicenca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: DadosAtivacao) => api.post<EstadoLicenca>('/api/licenca/ativar', dados),
    onSuccess: (estado) => {
      qc.setQueryData(CHAVE_LICENCA, estado);
      void qc.invalidateQueries({ queryKey: CHAVE_LICENCA });
    },
  });
}
