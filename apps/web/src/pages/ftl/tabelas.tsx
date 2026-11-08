import { formatPercentual } from '@jat/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Download,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Coluna } from '@/components/data-table';
import { EmptyState, Segmentado } from '@/components/page';
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
import { api, type TabelaFtl, type VeiculoFtl } from '@/lib/api';
import { ehAdmin, useMe } from '@/lib/auth';
import { camposTabela, COLUNAS_CSV_FTL, kmBR, ROTULO_LOCALIDADE } from './comum';
import { TabelaDialog, type AlvoTabela } from './tabela-dialog';

type Status = 'ativas' | 'inativas' | 'todas';

/** Aba "Tabelas de Preço": cadastro que alimenta a calculadora FTL. */
export function TabelasFtl() {
  const { data: user } = useMe();
  const admin = ehAdmin(user);
  const podeEditar = admin || !!user?.canEditRates;
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('ativas');
  const [alvo, setAlvo] = useState<AlvoTabela | null>(null);
  const [historico, setHistorico] = useState<TabelaFtl | null>(null);
  const [importar, setImportar] = useState(false);
  const [excluirTudo, setExcluirTudo] = useState(false);

  const lista = useQuery({
    queryKey: ['ftl-rates'],
    queryFn: async () => (await api.get<{ rates: TabelaFtl[] }>('/api/ftl/rates')).rates,
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: ['ftl-rates'] });

  const alternar = useMutation({
    mutationFn: (t: TabelaFtl) =>
      api.post<{ rate: TabelaFtl }>(`/api/ftl/rates/${t.id}/status`, { active: !t.active }),
    onSuccess: ({ rate }) => {
      toast.success(
        `Tabela ${rate.uf} ${ROTULO_LOCALIDADE[rate.locality]} ${rate.active ? 'ativada' : 'desativada'}.`,
      );
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  const todas = useMemo(() => lista.data ?? [], [lista.data]);
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todas.filter(
      (r) =>
        (status === 'todas' || (status === 'ativas') === r.active) &&
        (!t || r.uf.toLowerCase().includes(t) || r.region.toLowerCase().includes(t)),
    );
  }, [todas, busca, status]);

  const km = (v: VeiculoFtl, rotulo: string, className?: string): Coluna<TabelaFtl> => ({
    id: v,
    header: rotulo,
    accessorFn: (r) => Number(r.perKm[v]),
    meta: { className: `text-right ${className ?? ''}` },
    cell: ({ row }) => <span className="tabular font-medium">{kmBR(row.original.perKm[v])}</span>,
  });

  const colunas: Coluna<TabelaFtl>[] = [
    {
      accessorKey: 'uf',
      header: 'UF',
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.uf}</span>,
    },
    {
      accessorKey: 'region',
      header: 'Região',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.region}</span>,
    },
    {
      accessorKey: 'locality',
      header: 'Tipo',
      cell: ({ row }) => ROTULO_LOCALIDADE[row.original.locality],
    },
    km('VAN', 'VAN'),
    km('UTILITARIO', 'Utilitário', 'hidden sm:table-cell'),
    km('TRES_QUARTOS', '1,5T', 'hidden sm:table-cell'),
    {
      accessorKey: 'adValoremPct',
      header: 'Ad valorem',
      meta: { className: 'text-right hidden lg:table-cell' },
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {formatPercentual(row.original.adValoremPct)}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="success">Ativa</Badge>
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
                aria-label={`Ações da tabela ${t.uf} ${ROTULO_LOCALIDADE[t.locality]}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar && (
                <>
                  <DropdownMenuItem onSelect={() => setAlvo({ modo: 'editar', tabela: t })}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAlvo({ modo: 'duplicar', tabela: t })}>
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

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tabelas de preço</h2>
          <p className="text-muted-foreground text-sm">
            A calculadora usa a tabela ativa da UF e do tipo de localidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeEditar && (
            <Button variant="outline" onClick={() => setImportar(true)}>
              <Upload /> Importar CSV
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href="/api/ftl/rates/export" download>
              <Download /> Exportar CSV
            </a>
          </Button>
          {podeEditar && (
            <Button onClick={() => setAlvo({ modo: 'nova' })}>
              <Plus /> Nova tabela
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
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por UF ou região…"
            className="pl-9"
            aria-label="Buscar tabelas"
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
        <span className="text-muted-foreground text-sm sm:ml-auto">
          {lista.isSuccess && `${filtradas.length} de ${todas.length}`}
        </span>
      </div>

      <DataTable
        rotulo="Tabelas de preço FTL"
        colunas={colunas}
        dados={filtradas}
        carregando={lista.isPending}
        linhaClassName={(t) => (t.active ? undefined : 'opacity-60')}
        vazio={
          todas.length === 0 ? (
            <EmptyState
              icone={Table2}
              titulo="Nenhuma tabela cadastrada"
              descricao="Cadastre as tabelas por UF e tipo de localidade, ou importe o CSV."
              acao={
                podeEditar && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportar(true)}>
                      <Upload /> Importar CSV
                    </Button>
                    <Button onClick={() => setAlvo({ modo: 'nova' })}>
                      <Plus /> Nova tabela
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <EmptyState icone={Search} titulo="Nenhuma tabela encontrada" />
          )
        }
      />

      <TabelaDialog alvo={alvo} onFechar={() => setAlvo(null)} onSalvo={recarregar} />
      <HistoricoSheet
        alvo={historico?.id ?? null}
        onFechar={() => setHistorico(null)}
        titulo={historico ? `${historico.uf} ${ROTULO_LOCALIDADE[historico.locality]}` : ''}
        endpoint={historico ? `/api/ftl/rates/${historico.id}/history` : null}
        campos={camposTabela}
      />
      <ImportarCsvDialog
        aberto={importar}
        onAbertoChange={setImportar}
        titulo="Importar tabelas FTL"
        endpoint="/api/ftl/rates/import"
        colunas={COLUNAS_CSV_FTL}
        onImportado={recarregar}
      />
      <ExcluirTudoDialog
        aberto={excluirTudo}
        onAbertoChange={setExcluirTudo}
        endpoint="/api/ftl/rates/archive-all"
        quantidade={todas.length}
        oQue="tabelas FTL"
        onConcluido={recarregar}
      />
    </>
  );
}
