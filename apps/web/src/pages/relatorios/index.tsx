import { formatBRL, ROTULO_MODAL } from '@jat/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CotacaoVisaoSheet, IconeModal, type Visao } from '@/components/cotacao-visao';
import { DataTable, type Coluna } from '@/components/data-table';
import { AcoesDadosTeste, SeloTeste } from '@/components/dados-teste';
import { EmptyState, Page, PageHeader, Segmentado } from '@/components/page';
import { PeriodoSelect, type ValorPeriodo } from '@/components/periodo-select';
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
import { api, ApiError, type Cotacao, type RelatorioSpot, type StatusCotacao } from '@/lib/api';
import { ehAdmin, useMe } from '@/lib/auth';
import { formatData, formatDataHora } from '@/lib/format';
import { ehPeriodo, intervalo, type Periodo } from '@/lib/periodo';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';

const STATUS: StatusCotacao[] = ['PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA'];
const ORDENAVEIS = ['createdAt', 'number', 'clientName', 'total', 'status'] as const;
type Modal = 'todos' | 'AEREO' | 'RODOVIARIO';
const TAMANHOS = [25, 50, 100];

/** Lê os filtros do endereço (permite compartilhar o link do relatório filtrado). */
function useFiltros() {
  const [sp, setSp] = useSearchParams();
  const periodo: Periodo = ehPeriodo(sp.get('periodo')) ? (sp.get('periodo') as Periodo) : 'tudo';
  const status = sp.get('status');
  const modal = sp.get('modal');
  const sort = sp.get('sort');
  const filtros = {
    q: sp.get('q') ?? '',
    periodo,
    de: sp.get('de') ?? '',
    ate: sp.get('ate') ?? '',
    status: STATUS.includes(status as StatusCotacao) ? (status as StatusCotacao) : null,
    modal: (modal === 'AEREO' || modal === 'RODOVIARIO' ? modal : 'todos') as Modal,
    page: Math.max(1, Number(sp.get('page')) || 1),
    size: TAMANHOS.includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 25,
    sort: (ORDENAVEIS as readonly string[]).includes(sort ?? '')
      ? (sort as (typeof ORDENAVEIS)[number])
      : 'createdAt',
    dir: sp.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const),
  };
  /** Atualiza filtros; qualquer mudança que não seja de página volta para a página 1. */
  const mudar = (m: Partial<Record<keyof typeof filtros, string | number | null>>) =>
    setSp(
      (atual) => {
        const n = new URLSearchParams(atual);
        for (const [k, v] of Object.entries(m)) {
          if (v === null || v === '' || v === undefined) n.delete(k);
          else n.set(k, String(v));
        }
        if (!('page' in m)) n.delete('page');
        return n;
      },
      { replace: true },
    );
  return { filtros, mudar };
}

export default function RelatoriosPage() {
  const { data: user } = useMe();
  const admin = ehAdmin(user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { filtros, mudar } = useFiltros();
  const [busca, setBusca] = useState(filtros.q);
  const termo = useDebounce(busca.trim(), 300);
  const [visao, setVisao] = useState<{ q: Cotacao; v: Visao } | null>(null);
  const [alterarStatus, setAlterarStatus] = useState<Cotacao | null>(null);
  const [excluir, setExcluir] = useState<Cotacao | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (termo !== filtros.q) mudar({ q: termo });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à busca digitada
  }, [termo]);

  const { from, to } =
    filtros.periodo === 'personalizado'
      ? { from: filtros.de, to: filtros.ate }
      : intervalo(filtros.periodo);

  const params = new URLSearchParams();
  if (filtros.q) params.set('search', filtros.q);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.modal !== 'todos') params.set('modal', filtros.modal);
  const qsFiltros = params.toString();
  const qsLista = new URLSearchParams(params);
  qsLista.set('page', String(filtros.page));
  qsLista.set('pageSize', String(filtros.size));
  qsLista.set('sort', filtros.sort);
  qsLista.set('dir', filtros.dir);

  const rel = useQuery({
    queryKey: ['report-spot', qsLista.toString()],
    queryFn: () => api.get<RelatorioSpot>(`/api/reports/spot?${qsLista.toString()}`),
    placeholderData: (ant) => ant,
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ['report-spot'] });
    void qc.invalidateQueries({ queryKey: ['quotes'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const duplicar = useMutation({
    mutationFn: async (q: Cotacao) =>
      (await api.post<{ quote: Cotacao }>(`/api/quotes/${q.id}/duplicate`)).quote,
    onSuccess: (nova, orig) => {
      recarregar();
      toast.success(`Nova cotação ${nova.code} criada a partir da ${orig.code}.`, {
        action: { label: 'Abrir', onClick: () => editar(nova) },
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (q: Cotacao) => api.delete(`/api/quotes/${q.id}`),
    onSuccess: (_r, q) => {
      setExcluir(null);
      setVisao(null);
      recarregar();
      toast.success(`Cotação ${q.code} excluída.`);
    },
    onError: (e) => toast.error(e.message),
  });

  function editar(q: Cotacao) {
    navigate('/spot', { state: { abrir: q.id } });
  }

  const exportar = async () => {
    setExportando(true);
    try {
      const res = await fetch(`/api/reports/spot/export?${qsFiltros}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new ApiError(corpo?.message ?? 'Não foi possível gerar o Excel.', res.status);
      }
      const blob = await res.blob();
      const nome =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        'cotacoes-spot.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Excel com ${rel.data?.stats.count ?? ''} cotações gerado.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  const ordenacao: SortingState = [{ id: filtros.sort, desc: filtros.dir === 'desc' }];
  const dados = rel.data;
  const stats = dados?.stats;
  const totalPaginas = stats ? Math.max(1, Math.ceil(stats.count / filtros.size)) : 1;
  const filtrando = !!(
    filtros.q ||
    filtros.periodo !== 'tudo' ||
    filtros.status ||
    filtros.modal !== 'todos'
  );

  const acoesMenu = (q: Cotacao) => (
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuItem onSelect={() => setVisao({ q, v: 'cliente' })}>
        <Eye /> Visão cliente
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setVisao({ q, v: 'operacao' })}>
        <Lock /> Visão operação
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setAlterarStatus(q)}>
        <CircleDot /> Alterar status
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={q.status === 'APROVADA'}
        onSelect={() => editar(q)}
        title={q.status === 'APROVADA' ? 'Cotação aprovada não pode ser editada' : undefined}
      >
        <Pencil /> {q.status === 'APROVADA' ? 'Editar (aprovada)' : 'Editar'}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => duplicar.mutate(q)}>
        <Copy /> Duplicar como nova
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => window.open(`/api/quotes/${q.id}/pdf?visao=cliente`)}>
        <FileDown /> PDF do cliente
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => window.open(`/api/quotes/${q.id}/pdf?visao=operacao`)}>
        <FileText /> PDF da operação
      </DropdownMenuItem>
      {admin && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setExcluir(q)}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );

  const colunas: Coluna<Cotacao>[] = [
    {
      id: 'number',
      accessorKey: 'number',
      header: 'Nº',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setVisao({ q: row.original, v: 'cliente' })}
          className="text-primary tabular text-sm font-semibold whitespace-nowrap hover:underline"
        >
          {row.original.code}
        </button>
      ),
    },
    {
      id: 'teste',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (row.original.isTestData ? <SeloTeste /> : null),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Data',
      cell: ({ row }) => (
        <span
          className="tabular text-muted-foreground text-sm whitespace-nowrap"
          title={formatDataHora(row.original.createdAt)}
        >
          {formatData(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'clientName',
      accessorKey: 'clientName',
      header: 'Cliente',
      cell: ({ row }) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium">{row.original.clientName}</div>
          <div className="text-muted-foreground flex items-center gap-1 truncate text-xs lg:hidden">
            {row.original.originCity} <ArrowRight className="size-3 shrink-0" />{' '}
            {row.original.destCity}
          </div>
        </div>
      ),
    },
    {
      id: 'rota',
      header: 'Rota',
      enableSorting: false,
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => (
        <div className="flex max-w-80 min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">{row.original.origin}</span>
          <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate">{row.original.dest}</span>
        </div>
      ),
    },
    {
      id: 'modal',
      header: 'Modal',
      enableSorting: false,
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          <IconeModal
            modal={row.original.modal}
            className={cn(
              'size-3.5',
              row.original.modal === 'AEREO' ? 'text-modal-aereo' : 'text-modal-rodoviario',
            )}
          />
          {ROTULO_MODAL[row.original.modal]}
        </span>
      ),
    },
    {
      id: 'total',
      accessorKey: 'total',
      header: 'Total',
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="tabular font-semibold whitespace-nowrap">
          {formatBRL(row.original.total)}
        </span>
      ),
    },
    {
      id: 'status',
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
      enableSorting: false,
      meta: { className: 'hidden xl:table-cell' },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {row.original.createdBy?.name ?? '—'}
        </span>
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
          {acoesMenu(row.original)}
        </DropdownMenu>
      ),
    },
  ];

  const periodo: ValorPeriodo = { periodo: filtros.periodo, de: filtros.de, ate: filtros.ate };
  const inicio = stats && stats.count > 0 ? (filtros.page - 1) * filtros.size + 1 : 0;
  const fim = stats ? Math.min(filtros.page * filtros.size, stats.count) : 0;

  return (
    <Page>
      <PageHeader
        titulo="Relatório Spot"
        descricao="Cotações aéreas e rodoviárias: filtre, acompanhe o status e exporte para o Excel."
        acoes={
          <div className="flex flex-wrap gap-2">
            {admin && <AcoesDadosTeste onAlterado={recarregar} />}
            <Button
              onClick={() => void exportar()}
              disabled={exportando || !stats || stats.count === 0}
            >
              {exportando ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              Exportar Excel
            </Button>
          </div>
        }
      />

      <div className="bg-card mb-4 flex flex-col gap-3 rounded-xl border p-3 shadow-xs xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nº, cliente, origem ou destino…"
            className="pl-9"
            aria-label="Buscar cotações"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodoSelect
            id="rel-periodo"
            valor={periodo}
            onChange={(p) =>
              mudar({
                periodo: p.periodo === 'tudo' ? null : p.periodo,
                de: p.periodo === 'personalizado' ? p.de : null,
                ate: p.periodo === 'personalizado' ? p.ate : null,
              })
            }
          />
          <Select
            value={filtros.status ?? 'todos'}
            onValueChange={(v) => mudar({ status: v === 'todos' ? null : v })}
          >
            <SelectTrigger aria-label="Status" className="w-40">
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
          <Segmentado
            rotulo="Modal"
            valor={filtros.modal}
            onChange={(v) => mudar({ modal: v === 'todos' ? null : v })}
            opcoes={[
              { valor: 'todos', rotulo: 'Todos' },
              { valor: 'AEREO', rotulo: 'Aéreo' },
              { valor: 'RODOVIARIO', rotulo: 'Rodoviário' },
            ]}
          />
          <Button
            variant="ghost"
            disabled={!filtrando}
            onClick={() => {
              setBusca('');
              mudar({ q: null, periodo: null, de: null, ate: null, status: null, modal: null });
            }}
          >
            <X /> Limpar
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat rotulo="Cotações" valor={stats ? String(stats.count) : null} destaque />
        <Stat rotulo="Valor total" valor={stats ? formatBRL(stats.value) : null} destaque />
        {STATUS.map((s) => {
          const d = stats?.byStatus.find((x) => x.status === s);
          return (
            <Stat
              key={s}
              rotulo={ROTULO_STATUS[s]}
              valor={d ? String(d.count) : null}
              detalhe={d ? formatBRL(d.value) : undefined}
              status={s}
              ativo={filtros.status === s}
              onClick={() => mudar({ status: filtros.status === s ? null : s })}
            />
          );
        })}
      </div>

      <div className={cn('transition-opacity', rel.isPlaceholderData && 'opacity-60')}>
        <DataTable
          rotulo="Cotações Spot"
          colunas={colunas}
          dados={dados?.quotes}
          carregando={rel.isPending}
          ordenacaoServidor={{
            valor: ordenacao,
            onChange: (s) => {
              const o = s[0];
              mudar({
                sort: o && o.id !== 'createdAt' ? o.id : o?.desc === false ? 'createdAt' : null,
                dir: o?.desc === false ? 'asc' : null,
              });
            },
          }}
          vazio={
            filtrando ? (
              <EmptyState
                icone={Search}
                titulo="Nenhuma cotação encontrada"
                descricao="Ajuste ou limpe os filtros."
              />
            ) : (
              <EmptyState
                icone={FileText}
                titulo="Nenhuma cotação Spot ainda"
                descricao="As cotações salvas no Frete Spot aparecem aqui."
                acao={
                  <Button onClick={() => navigate('/spot')}>
                    Nova cotação <ArrowRight />
                  </Button>
                }
              />
            )
          }
        />
      </div>

      {stats && stats.count > 0 && (
        <div className="mt-3 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
          <span className="text-muted-foreground tabular" data-testid="paginacao">
            {inicio}–{fim} de {stats.count}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden sm:inline">Por página</span>
            <Select value={String(filtros.size)} onValueChange={(v) => mudar({ size: v })}>
              <SelectTrigger aria-label="Cotações por página" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAMANHOS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Página anterior"
              disabled={filtros.page <= 1}
              onClick={() => mudar({ page: filtros.page - 1 })}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular min-w-20 text-center">
              {filtros.page} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Próxima página"
              disabled={filtros.page >= totalPaginas}
              onClick={() => mudar({ page: filtros.page + 1 })}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <CotacaoVisaoSheet
        cotacao={visao?.q ?? null}
        visao={visao?.v ?? 'cliente'}
        onVisaoChange={(v) => setVisao((a) => (a ? { ...a, v } : a))}
        onFechar={() => setVisao(null)}
        acoes={(q) => (
          <>
            <Button variant="outline" size="sm" onClick={() => setAlterarStatus(q)}>
              <CircleDot /> Status
            </Button>
            <Button
              size="sm"
              className="ml-auto"
              disabled={q.status === 'APROVADA'}
              title={q.status === 'APROVADA' ? 'Cotação aprovada não pode ser editada' : undefined}
              onClick={() => editar(q)}
            >
              <Pencil /> Editar
            </Button>
          </>
        )}
      />
      <StatusDialog
        cotacao={alterarStatus}
        onFechar={() => setAlterarStatus(null)}
        onAlterado={(q) => {
          recarregar();
          setVisao((a) => (a && a.q.id === q.id ? { ...a, q } : a));
        }}
      />
      <ConfirmDialog
        aberto={!!excluir}
        onAbertoChange={(v) => !v && setExcluir(null)}
        titulo={`Excluir a cotação ${excluir?.code ?? ''}?`}
        descricao={
          <>
            Ela deixa de aparecer nas telas, no relatório e no dashboard. O registro continua
            guardado no banco e a exclusão fica na auditoria.
          </>
        }
        confirmar="Excluir cotação"
        carregando={remover.isPending}
        onConfirmar={() => excluir && remover.mutate(excluir)}
      />
    </Page>
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
  destaque,
  status,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: string | null;
  detalhe?: string;
  destaque?: boolean;
  status?: StatusCotacao;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? ativo : undefined}
      title={onClick ? `Filtrar: ${rotulo}` : undefined}
      className={cn(
        'bg-card rounded-xl border px-4 py-3 text-left shadow-xs transition-colors',
        onClick && 'hover:border-primary/40 hover:bg-accent/40',
        ativo && 'border-primary/60 ring-primary/20 ring-2',
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {status && <span className={cn('size-2 rounded-full', COR_STATUS[status])} />}
        {rotulo}
      </div>
      {valor === null ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
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
      {detalhe && <div className="tabular text-muted-foreground text-xs">{detalhe}</div>}
    </Tag>
  );
}
