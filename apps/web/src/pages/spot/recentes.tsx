import { formatBRL } from '@jat/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Segmentado } from '@/components/page';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Cotacao } from '@/lib/api';
import { formatDataHora } from '@/lib/format';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';

export function CotacoesRecentes({
  aberto,
  onAbertoChange,
  onAbrir,
  atualId,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  onAbrir: (q: Cotacao) => void;
  atualId?: string;
}) {
  const [busca, setBusca] = useState('');
  const [quem, setQuem] = useState<'todas' | 'minhas'>('todas');
  const termo = useDebounce(busca.trim(), 250);
  const lista = useQuery({
    queryKey: ['quotes', { termo, quem }],
    queryFn: async () =>
      (
        await api.get<{ quotes: Cotacao[] }>(
          `/api/quotes?limit=30&mine=${quem === 'minhas' ? 1 : 0}&search=${encodeURIComponent(termo)}`,
        )
      ).quotes,
    enabled: aberto,
    placeholderData: (a) => a,
  });

  return (
    <Sheet open={aberto} onOpenChange={onAbertoChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Cotações recentes</SheetTitle>
          <SheetDescription>Abra uma cotação para editar, copiar ou gerar o PDF.</SheetDescription>
          <div className="mt-3 grid gap-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número, cliente ou cidade…"
                className="pl-9"
                aria-label="Buscar cotações"
              />
            </div>
            <Segmentado
              rotulo="Quem criou"
              valor={quem}
              onChange={setQuem}
              opcoes={[
                { valor: 'todas', rotulo: 'Todas' },
                { valor: 'minhas', rotulo: 'Minhas' },
              ]}
            />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {lista.isPending ? (
            <div className="grid gap-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !lista.data?.length ? (
            <EmptyState icone={FileSearch} titulo="Nenhuma cotação encontrada" />
          ) : (
            <ul className="divide-y">
              {lista.data.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => onAbrir(q)}
                    className={cn(
                      'hover:bg-accent/60 w-full px-5 py-3.5 text-left transition-colors',
                      atualId === q.id && 'bg-primary/6',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-primary tabular text-sm font-semibold">{q.code}</span>
                      <StatusBadge status={q.status} />
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{q.clientName}</div>
                    <div className="text-muted-foreground mt-0.5 flex items-center gap-1 truncate text-xs">
                      {q.origin} <ArrowRight className="size-3 shrink-0" /> {q.dest}
                    </div>
                    <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
                      <span>
                        {formatDataHora(q.createdAt)} · {q.createdBy?.name}
                      </span>
                      <span className="text-foreground tabular font-semibold">
                        {formatBRL(q.total)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
