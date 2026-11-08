import { formatBRL, formatNumero, textoCotacaoFtl, type DadosTextoFtl } from '@jat/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, Copy, FileDown, FileText, MoreHorizontal, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Coluna } from '@/components/data-table';
import { DateInput } from '@/components/date-input';
import { EmptyState } from '@/components/page';
import { ROTULO_STATUS, StatusBadge } from '@/components/status-badge';
import { StatusDialog } from '@/components/status-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Configuracoes, type Cotacao, type StatusCotacao } from '@/lib/api';
import { formatData, formatDataHora } from '@/lib/format';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';
import { ROTULO_LOCALIDADE, ROTULO_VEICULO } from './comum';

const STATUS: StatusCotacao[] = ['PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA'];

/** Aba "Relatório": histórico das cotações FTL com status. */
export function RelatorioFtl() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusCotacao | 'todos'>('todos');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [alterarStatus, setAlterarStatus] = useState<Cotacao | null>(null);
  const termo = useDebounce(busca.trim(), 250);

  const filtros = new URLSearchParams();
  if (termo) filtros.set('search', termo);
  if (status !== 'todos') filtros.set('status', status);
  if (de) filtros.set('from', de);
  if (ate) filtros.set('to', ate);
  const qs = filtros.toString();

  const lista = useQuery({
    queryKey: ['ftl-quotes', qs],
    queryFn: async () => (await api.get<{ quotes: Cotacao[] }>(`/api/ftl/quotes?${qs}`)).quotes,
    placeholderData: (ant) => ant,
  });
  const cfg = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Configuracoes>('/api/settings'),
  });

  const cotacoes = useMemo(() => lista.data ?? [], [lista.data]);
  const stats = useMemo(() => {
    const soma = (qs: Cotacao[]) => qs.reduce((s, q) => s + Number(q.total), 0);
    return {
      qtd: cotacoes.length,
      total: soma(cotacoes),
      porStatus: STATUS.map((s) => {
        const d = cotacoes.filter((q) => q.status === s);
        return { status: s, qtd: d.length, valor: soma(d) };
      }),
    };
  }, [cotacoes]);

  const copiar = async (q: Cotacao) => {
    const f = q.ftl!;
    const d: DadosTextoFtl = {
      numero: q.number,
      uf: f.uf ?? '',
      regiao: f.region,
      localidade: f.locality ?? 'CAPITAL',
      veiculo: f.vehicle ? ROTULO_VEICULO[f.vehicle] : '',
      distanciaKm: f.distanceKm ?? '0',
      tarifaKm: f.ratePerKm ?? '0',
      total: q.total,
      adValoremPct: q.adValoremPct,
      data: new Date(q.createdAt),
      condicoes: cfg.data?.condicoesFtl ?? '',
      observacoes: q.notes,
    };
    try {
      await navigator.clipboard.writeText(textoCotacaoFtl(d, { whatsapp: true }));
      toast.success(`Texto da cotação ${q.code} copiado.`);
    } catch {
      toast.error('Não foi possível copiar. Verifique a permissão da área de transferência.');
    }
  };

  const colunas: Coluna<Cotacao>[] = [
    {
      accessorKey: 'number',
      header: 'Nº',
      cell: ({ row }) => (
        <span className="tabular font-mono text-sm font-semibold">{row.original.code}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Data',
      cell: ({ row }) => (
        <span
          className="tabular text-muted-foreground text-sm"
          title={formatDataHora(row.original.createdAt)}
        >
          {formatData(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'destino',
      header: 'Destino',
      accessorFn: (q) => q.ftl?.uf ?? '',
      cell: ({ row }) => {
        const f = row.original.ftl;
        return (
          <div>
            <span className="font-mono font-semibold">{f?.uf}</span>{' '}
            <span className="text-muted-foreground text-sm">
              {f?.locality ? ROTULO_LOCALIDADE[f.locality] : ''}
            </span>
          </div>
        );
      },
    },
    {
      id: 'veiculo',
      header: 'Veículo',
      accessorFn: (q) => q.ftl?.vehicle ?? '',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => {
        const v = row.original.ftl?.vehicle;
        return v ? ROTULO_VEICULO[v] : '—';
      },
    },
    {
      id: 'km',
      header: 'KM',
      accessorFn: (q) => Number(q.ftl?.distanceKm ?? 0),
      meta: { className: 'text-right hidden md:table-cell' },
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {formatNumero(row.original.ftl?.distanceKm ?? '0', 0, 2)}
        </span>
      ),
    },
    {
      id: 'total',
      header: 'Valor',
      accessorFn: (q) => Number(q.total),
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="tabular font-semibold">{formatBRL(row.original.total)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setAlterarStatus(row.original)}
          className="rounded-full"
          title="Alterar status"
        >
          <StatusBadge status={row.original.status} />
        </button>
      ),
    },
    {
      id: 'por',
      header: 'Criada por',
      accessorFn: (q) => q.createdBy?.name ?? '',
      meta: { className: 'hidden xl:table-cell' },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.createdBy?.name ?? '—'}</span>
      ),
    },
    {
      id: 'acoes',
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      meta: { className: 'w-12 text-right' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Ações da cotação ${row.original.code}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAlterarStatus(row.original)}>
              <CircleDot /> Alterar status
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void copiar(row.original)}>
              <Copy /> Copiar texto
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => window.open(`/api/quotes/${row.original.id}/pdf`, '_blank')}
            >
              <FileDown /> PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filtrando = !!(termo || status !== 'todos' || de || ate);

  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_9.5rem_9.5rem_auto] md:items-end">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nº da cotação, UF ou região…"
            className="pl-9"
            aria-label="Buscar cotações FTL"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusCotacao | 'todos')}>
          <SelectTrigger aria-label="Status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {ROTULO_STATUS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateInput
          id="ftl-de"
          valor={de}
          onChange={setDe}
          aria-label="De"
          placeholder="De"
          key={`de-${de === '' ? 'v' : 'p'}`}
        />
        <DateInput
          id="ftl-ate"
          valor={ate}
          onChange={setAte}
          aria-label="Até"
          placeholder="Até"
          key={`ate-${ate === '' ? 'v' : 'p'}`}
        />
        <Button
          variant="ghost"
          disabled={!filtrando}
          onClick={() => {
            setBusca('');
            setStatus('todos');
            setDe('');
            setAte('');
          }}
        >
          <X /> Limpar
        </Button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[0.8fr_1.5fr_1fr_1fr_1fr_1fr]">
        <Stat rotulo="Cotações" valor={String(stats.qtd)} carregando={lista.isPending} destaque />
        <Stat
          rotulo="Valor total"
          valor={formatBRL(stats.total.toFixed(2))}
          carregando={lista.isPending}
          destaque
        />
        {stats.porStatus.map((s) => (
          <Stat
            key={s.status}
            rotulo={ROTULO_STATUS[s.status]}
            valor={String(s.qtd)}
            detalhe={formatBRL(s.valor.toFixed(2))}
            carregando={lista.isPending}
            status={s.status}
          />
        ))}
      </div>

      <DataTable
        rotulo="Cotações FTL"
        colunas={colunas}
        dados={cotacoes}
        carregando={lista.isPending}
        vazio={
          filtrando ? (
            <EmptyState
              icone={Search}
              titulo="Nenhuma cotação encontrada"
              descricao="Ajuste os filtros."
            />
          ) : (
            <EmptyState
              icone={FileText}
              titulo="Nenhuma cotação FTL ainda"
              descricao="As cotações salvas na calculadora aparecem aqui."
            />
          )
        }
      />
      {lista.data && lista.data.length >= 200 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Mostrando as 200 mais recentes. Use os filtros para refinar.
        </p>
      )}

      <StatusDialog
        cotacao={alterarStatus}
        onFechar={() => setAlterarStatus(null)}
        onAlterado={() => void qc.invalidateQueries({ queryKey: ['ftl-quotes'] })}
      />
    </>
  );
}

const COR_STATUS: Record<StatusCotacao, string> = {
  PENDENTE: 'bg-status-pendente',
  APROVADA: 'bg-status-aprovada',
  DECLINADA: 'bg-status-declinada',
  RECUSADA: 'bg-status-recusada',
};

function Stat({
  rotulo,
  valor,
  detalhe,
  carregando,
  destaque,
  status,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  carregando: boolean;
  destaque?: boolean;
  status?: StatusCotacao;
}) {
  return (
    <div
      className={cn('bg-card rounded-xl border px-4 py-3 shadow-xs', destaque && 'sm:col-span-1')}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {status && <span className={cn('size-2 rounded-full', COR_STATUS[status])} />}
        {rotulo}
      </div>
      {carregando ? (
        <Skeleton className="mt-1.5 h-6 w-16" />
      ) : (
        <div
          className={cn(
            'tabular mt-0.5 font-semibold whitespace-nowrap',
            destaque ? 'text-xl' : 'text-lg',
          )}
        >
          {valor}
        </div>
      )}
      {detalhe && !carregando && (
        <div className="tabular text-muted-foreground text-xs">{detalhe}</div>
      )}
    </div>
  );
}
