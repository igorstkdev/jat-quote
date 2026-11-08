import { formatBRL } from '@jat/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Download,
  ExternalLink,
  History,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { DataTable, type Coluna } from '@/components/data-table';
import { EmptyState, Page, PageHeader, Segmentado } from '@/components/page';
import { ExcluirTudoDialog } from '@/components/tarifas/excluir-tudo';
import { HistoricoSheet } from '@/components/tarifas/historico';
import { ImportarCsvDialog } from '@/components/tarifas/importar-csv';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Companhia, type Configuracoes, type Nivel, type TarifaAerea } from '@/lib/api';
import { ehAdmin, useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CalculadoraRapida } from './calculadora';
import { camposTarifa, CiaBadge, COMPANHIAS, corCia, tarifaKg, vigencia } from './comum';
import { TarifaDialog, type AlvoTarifa } from './tarifa-dialog';

type Status = 'ativas' | 'inativas' | 'todas';

const COLUNAS_CSV =
  'Origem; Destino; Companhia; Urgente R$/Kg; Urgente Min; Rápido R$/Kg; Rápido Min; Econômico R$/Kg; Econômico Min; Status; Versão; Vigência Início; Vigência Fim; Observações';

export default function TarifasAereasPage() {
  const { data: user } = useMe();
  const admin = ehAdmin(user);
  const podeEditar = admin || !!user?.canEditRates;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('ativas');
  const [cia, setCia] = useState<Companhia | null>(null);
  const [editando, setEditando] = useState<AlvoTarifa | null>(null);
  const [historico, setHistorico] = useState<TarifaAerea | null>(null);
  const [importar, setImportar] = useState(false);
  const [excluirTudo, setExcluirTudo] = useState(false);

  const alvo =
    editando ?? (params.get('novo') === '1' && podeEditar ? ({ modo: 'nova' } as const) : null);
  const fecharForm = () => {
    setEditando(null);
    if (params.has('novo')) setParams({}, { replace: true });
  };

  const lista = useQuery({
    queryKey: ['air-rates'],
    queryFn: () => api.get<{ rates: TarifaAerea[]; today: string }>('/api/air-rates'),
  });
  const cfg = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Configuracoes>('/api/settings'),
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: ['air-rates'] });

  const alternar = useMutation({
    mutationFn: (t: TarifaAerea) =>
      api.post<{ rate: TarifaAerea }>(`/api/air-rates/${t.id}/status`, { active: !t.active }),
    onSuccess: ({ rate }) => {
      toast.success(
        `Tarifa ${rate.airline} ${rate.origin} → ${rate.destination} ${rate.active ? 'ativada' : 'desativada'}.`,
      );
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  const todas = useMemo(() => lista.data?.rates ?? [], [lista.data]);
  const filtradas = useMemo(() => {
    const t = busca.trim().toUpperCase();
    return todas.filter(
      (r) =>
        (status === 'todas' || (status === 'ativas') === r.active) &&
        (!cia || r.airline === cia) &&
        (!t ||
          r.origin.includes(t) ||
          r.destination.includes(t) ||
          r.airline.includes(t) ||
          `${r.origin}${r.destination}`.includes(t.replace(/\W/g, ''))),
    );
  }, [todas, busca, status, cia]);

  const aeroportos = useMemo(
    () =>
      [...new Set(todas.filter((r) => r.active).flatMap((r) => [r.origin, r.destination]))].sort(),
    [todas],
  );

  const nivel = (n: Nivel) => ({
    id: n,
    header: { URGENTE: 'Urgente', RAPIDO: 'Rápido', ECONOMICO: 'Econômico' }[n],
    enableSorting: false,
    meta: { className: cn('text-right', n !== 'URGENTE' && 'hidden md:table-cell') },
    cell: ({ row }: { row: { original: TarifaAerea } }) => {
      const l = row.original.levels[n];
      return l ? (
        <div className="tabular text-right leading-tight">
          <div className="font-medium">{tarifaKg(l.perKg)}</div>
          <div className="text-muted-foreground text-xs">mín. {formatBRL(l.min)}</div>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  });

  const colunas: Coluna<TarifaAerea>[] = [
    {
      id: 'rota',
      header: 'Rota',
      accessorFn: (r) => `${r.origin}${r.destination}`,
      cell: ({ row }) => (
        <div className="font-mono font-semibold tracking-wide">
          {row.original.origin}
          <span className="text-brand-accent mx-1.5 font-sans">→</span>
          {row.original.destination}
          {row.original.notes && (
            <div
              className="text-muted-foreground max-w-48 truncate font-sans text-xs font-normal tracking-normal"
              title={row.original.notes}
            >
              {row.original.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'airline',
      header: 'CIA',
      cell: ({ row }) => <CiaBadge cia={row.original.airline} />,
    },
    nivel('URGENTE'),
    nivel('RAPIDO'),
    nivel('ECONOMICO'),
    {
      id: 'vigencia',
      header: 'Vigência',
      accessorFn: (r) => r.validFrom,
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground text-sm whitespace-nowrap">
          {vigencia(row.original)}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) =>
        row.original.current ? (
          <Badge variant="success">Vigente</Badge>
        ) : row.original.active ? (
          <Badge variant="outline" title="Ativa, mas fora da vigência hoje">
            Fora da vigência
          </Badge>
        ) : (
          <Badge variant="outline">Inativa</Badge>
        ),
    },
    {
      accessorKey: 'version',
      header: 'Versão',
      meta: { className: 'hidden xl:table-cell text-right' },
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">v{row.original.version}</span>
      ),
    },
    {
      id: 'acoes',
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      meta: { className: 'w-12 text-right' },
      cell: ({ row }) => {
        const t = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Ações da tarifa ${t.airline} ${t.origin} ${t.destination}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar && (
                <>
                  <DropdownMenuItem onSelect={() => setEditando({ modo: 'editar', tarifa: t })}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditando({ modo: 'duplicar', tarifa: t })}>
                    <Copy /> Duplicar
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onSelect={() => setHistorico(t)}>
                <History /> Histórico
              </DropdownMenuItem>
              {podeEditar && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => alternar.mutate(t)}>
                    {t.active ? <Power /> : <RotateCcw />}
                    {t.active ? 'Desativar' : 'Ativar'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const porCia = (c: Companhia) => todas.filter((r) => r.airline === c);

  return (
    <Page>
      <PageHeader
        titulo="Tarifas Aéreas"
        descricao="Tarifas GOL, AZUL e LATAM por rota, com vigência e histórico de versões."
        acoes={
          <>
            {podeEditar && (
              <Button variant="outline" onClick={() => setImportar(true)}>
                <Upload /> Importar CSV
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href="/api/air-rates/export" download>
                <Download /> Exportar CSV
              </a>
            </Button>
            {podeEditar && (
              <Button onClick={() => setEditando({ modo: 'nova' })}>
                <Plus /> Nova tarifa
              </Button>
            )}
            {admin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais ações">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={todas.length === 0}
                    onSelect={() => setExcluirTudo(true)}
                  >
                    <Trash2 /> Excluir tudo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {/* Resumo + links de rastreio */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Cartao
          rotulo="Total de tarifas"
          valor={todas.length}
          detalhe={`${todas.filter((r) => r.current).length} vigentes hoje`}
          carregando={lista.isPending}
          ativo={cia === null}
          onClick={() => setCia(null)}
          icone={<Plane className="text-primary size-4" />}
        />
        {COMPANHIAS.map((c) => (
          <Cartao
            key={c}
            rotulo={c}
            valor={porCia(c).length}
            detalhe={`${porCia(c).filter((r) => r.current).length} vigentes hoje`}
            carregando={lista.isPending}
            ativo={cia === c}
            onClick={() => setCia(cia === c ? null : c)}
            icone={<span className={cn('size-2.5 rounded-full', corCia(c))} />}
          />
        ))}
        <div className="bg-card rounded-xl border p-4 shadow-xs sm:col-span-2 lg:col-span-1">
          <div className="text-muted-foreground text-xs font-medium">Links de rastreio</div>
          <div className="mt-2 grid gap-1">
            {(cfg.data?.linksRastreio ?? []).map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {l.name}
              </a>
            ))}
            {cfg.isSuccess && cfg.data.linksRastreio.length === 0 && (
              <span className="text-muted-foreground text-sm">Nenhum link configurado.</span>
            )}
          </div>
        </div>
      </div>

      <CalculadoraRapida aeroportos={aeroportos} />

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Tarifas cadastradas</h2>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por aeroporto ou CIA…"
            className="pl-9"
            aria-label="Buscar tarifas"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Segmentado
          rotulo="Filtrar por status"
          valor={status}
          onChange={setStatus}
          opcoes={[
            { valor: 'ativas', rotulo: 'Ativas' },
            { valor: 'inativas', rotulo: 'Inativas' },
            { valor: 'todas', rotulo: 'Todas' },
          ]}
        />
        {cia && (
          <Button variant="secondary" size="sm" onClick={() => setCia(null)}>
            {cia} <X />
          </Button>
        )}
        <div className="text-muted-foreground text-sm sm:ml-auto">
          {lista.isSuccess && `${filtradas.length} de ${todas.length}`}
        </div>
      </div>

      <DataTable
        rotulo="Tarifas aéreas"
        colunas={colunas}
        dados={filtradas}
        carregando={lista.isPending}
        linhaClassName={(t) => (t.active ? undefined : 'opacity-60')}
        vazio={
          todas.length === 0 ? (
            <EmptyState
              icone={Plane}
              titulo="Nenhuma tarifa cadastrada"
              descricao="Cadastre as tarifas ou importe o CSV exportado do sistema antigo."
              acao={
                podeEditar && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportar(true)}>
                      <Upload /> Importar CSV
                    </Button>
                    <Button onClick={() => setEditando({ modo: 'nova' })}>
                      <Plus /> Nova tarifa
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <EmptyState icone={Search} titulo="Nenhuma tarifa encontrada" />
          )
        }
      />

      <TarifaDialog alvo={alvo} onFechar={fecharForm} onSalvo={recarregar} />
      <HistoricoSheet
        alvo={historico?.id ?? null}
        onFechar={() => setHistorico(null)}
        titulo={
          historico ? `${historico.airline} ${historico.origin} → ${historico.destination}` : ''
        }
        endpoint={historico ? `/api/air-rates/${historico.id}/history` : null}
        campos={camposTarifa}
      />
      <ImportarCsvDialog
        aberto={importar}
        onAbertoChange={setImportar}
        titulo="Importar tarifas aéreas"
        endpoint="/api/air-rates/import"
        colunas={COLUNAS_CSV}
        onImportado={recarregar}
      />
      <ExcluirTudoDialog
        aberto={excluirTudo}
        onAbertoChange={setExcluirTudo}
        endpoint="/api/air-rates/archive-all"
        quantidade={todas.length}
        oQue="tarifas aéreas"
        onConcluido={recarregar}
      />
    </Page>
  );
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  carregando,
  ativo,
  onClick,
  icone,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  carregando: boolean;
  ativo: boolean;
  onClick: () => void;
  icone: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'bg-card hover:border-primary/40 rounded-xl border p-4 text-left shadow-xs transition-all',
        ativo && 'border-primary/50 ring-primary/15 ring-2',
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        {icone}
        {rotulo}
      </div>
      {carregando ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <div className="tabular mt-1 text-2xl font-semibold">{valor}</div>
      )}
      <div className="text-muted-foreground text-xs">{detalhe}</div>
    </button>
  );
}
