import { useQuery } from '@tanstack/react-query';
import { api, type LinkUtil } from './api';

export const CHAVE_LINKS = ['links'] as const;

export function useLinksUteis() {
  return useQuery({
    queryKey: CHAVE_LINKS,
    queryFn: async () => (await api.get<{ links: LinkUtil[] }>('/api/links')).links,
    staleTime: 5 * 60_000,
  });
}
