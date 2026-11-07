import type { StatusCotacao } from '@/lib/api';
import { cn } from '@/lib/utils';

export const ROTULO_STATUS: Record<StatusCotacao, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  DECLINADA: 'Declinada',
  RECUSADA: 'Recusada',
};

const COR: Record<StatusCotacao, string> = {
  PENDENTE: 'bg-status-pendente/12 text-status-pendente',
  APROVADA: 'bg-status-aprovada/12 text-status-aprovada',
  DECLINADA: 'bg-status-declinada/14 text-status-declinada',
  RECUSADA: 'bg-status-recusada/12 text-status-recusada',
};

/** Status da cotação com as cores do CLAUDE.md §3.5. */
export function StatusBadge({ status, className }: { status: StatusCotacao; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        COR[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {ROTULO_STATUS[status]}
    </span>
  );
}
