import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { EmptyState } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type VersaoHistorico } from '@/lib/api';
import { formatDataHora } from '@/lib/format';
import { cn } from '@/lib/utils';

const ROTULO_ACAO: Record<string, string> = {
  CRIAR: 'Criada',
  EDITAR: 'Editada',
  IMPORTAR: 'Importada',
  ATIVAR: 'Ativada',
  DESATIVAR: 'Desativada',
};

/** Histórico completo de versões de uma tarifa/tabela, destacando o que mudou. */
export function HistoricoSheet<T>({
  alvo,
  onFechar,
  titulo,
  endpoint,
  campos,
}: {
  alvo: string | null;
  onFechar: () => void;
  titulo: string;
  /** Ex.: /api/air-rates/:id/history */
  endpoint: string | null;
  /** Converte a versão gravada em [rótulo, valor] para exibir. */
  campos: (s: T & { version: number }) => [string, string][];
}) {
  const q = useQuery({
    queryKey: ['historico', endpoint],
    queryFn: async () => (await api.get<{ history: VersaoHistorico<T>[] }>(endpoint!)).history,
    enabled: !!endpoint,
  });

  return (
    <Sheet open={!!alvo} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico de versões</SheetTitle>
          <SheetDescription>{titulo}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4 pb-6">
          {q.isPending ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : !q.data?.length ? (
            <EmptyState icone={History} titulo="Sem histórico" />
          ) : (
            q.data.map((h, i) => {
              const atual = campos(h.snapshot);
              const anterior = q.data[i + 1] ? new Map(campos(q.data[i + 1]!.snapshot)) : null;
              return (
                <div key={h.id} className="bg-card rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="tabular">
                        v{h.version}
                      </Badge>
                      <span className="text-sm font-medium">
                        {ROTULO_ACAO[h.action] ?? h.action}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {formatDataHora(h.at)} · {h.username ?? '—'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {atual.map(([rot, val]) => {
                      const mudou = anterior !== null && anterior.get(rot) !== val;
                      return (
                        <div key={rot} className="contents">
                          <dt className="text-muted-foreground">{rot}</dt>
                          <dd
                            className={cn(
                              'tabular text-right',
                              mudou && 'text-primary font-semibold',
                            )}
                          >
                            {val}
                            {mudou && (
                              <span className="text-muted-foreground ml-1.5 text-xs font-normal line-through">
                                {anterior.get(rot)}
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
