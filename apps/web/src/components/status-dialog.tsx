import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ROTULO_STATUS, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, type Cotacao, type MudancaStatus, type StatusCotacao } from '@/lib/api';
import { ehAdmin, useMe } from '@/lib/auth';
import { formatDataHora } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS: StatusCotacao[] = ['PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA'];
const DESCRICAO: Record<StatusCotacao, string> = {
  PENDENTE: 'Aguardando retorno do cliente',
  APROVADA: 'Cliente aprovou',
  DECLINADA: 'Cliente recusou (preço ou prazo)',
  RECUSADA: 'Inviável operacionalmente',
};

/**
 * Alterar status (CLAUDE.md §3.5): qualquer usuário muda uma cotação que não está Aprovada;
 * tirar de Aprovada é só Admin. Mostra o histórico (quem, quando, de → para).
 */
export function StatusDialog({
  cotacao,
  onFechar,
  onAlterado,
}: {
  cotacao: Cotacao | null;
  onFechar: () => void;
  onAlterado: (q: Cotacao) => void;
}) {
  return (
    <Dialog open={!!cotacao} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {cotacao && (
          <Conteudo
            key={cotacao.id}
            cotacao={cotacao}
            onFechar={onFechar}
            onAlterado={onAlterado}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  cotacao,
  onFechar,
  onAlterado,
}: {
  cotacao: Cotacao;
  onFechar: () => void;
  onAlterado: (q: Cotacao) => void;
}) {
  const { data: user } = useMe();
  const bloqueada = cotacao.status === 'APROVADA' && !ehAdmin(user);
  const [novo, setNovo] = useState<StatusCotacao | null>(null);
  const [nota, setNota] = useState('');

  const historico = useQuery({
    queryKey: ['status-history', cotacao.id],
    queryFn: async () =>
      (await api.get<{ changes: MudancaStatus[] }>(`/api/quotes/${cotacao.id}/status-history`))
        .changes,
  });

  const alterar = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ quote: Cotacao }>(`/api/quotes/${cotacao.id}/status`, {
          status: novo,
          note: nota,
        })
      ).quote,
    onSuccess: (q) => {
      toast.success(`Cotação ${q.code}: ${ROTULO_STATUS[q.status]}.`);
      onAlterado(q);
      onFechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Status da cotação {cotacao.code}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          Atual: <StatusBadge status={cotacao.status} />
        </DialogDescription>
      </DialogHeader>

      {bloqueada ? (
        <div className="bg-muted/50 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          Cotação aprovada: só um Admin pode alterar o status.
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Novo status" className="grid grid-cols-2 gap-2">
            {STATUS.filter((s) => s !== cotacao.status).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={novo === s}
                onClick={() => setNovo(s)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-all',
                  novo === s
                    ? 'border-primary bg-primary/6 ring-primary/20 ring-2'
                    : 'hover:bg-accent',
                )}
              >
                <StatusBadge status={s} />
                <div className="text-muted-foreground mt-1.5 text-xs">{DESCRICAO[s]}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="status-nota">Comentário (opcional)</Label>
            <Textarea
              id="status-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Ex.: cliente achou o prazo longo"
            />
          </div>
        </>
      )}

      <div>
        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
          Histórico
        </div>
        {historico.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ol className="grid max-h-44 gap-2 overflow-y-auto text-sm">
            {historico.data?.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {h.from ? (
                  <>
                    <StatusBadge status={h.from} />
                    <ArrowRight className="text-muted-foreground size-3.5" />
                  </>
                ) : null}
                <StatusBadge status={h.to} />
                <span className="text-muted-foreground text-xs">
                  {formatDataHora(h.at)} · {h.user}
                </span>
                {h.note && (
                  <span className="text-muted-foreground w-full text-xs italic">“{h.note}”</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          Fechar
        </Button>
        {!bloqueada && (
          <Button onClick={() => alterar.mutate()} disabled={!novo || alterar.isPending}>
            {alterar.isPending && <Loader2 className="animate-spin" />}
            {novo ? `Marcar como ${ROTULO_STATUS[novo]}` : 'Escolha o novo status'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
