import {
  createSortedRowModel,
  FlexRender,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export const recursosTabela = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export type Coluna<T extends RowData> = ColumnDef<typeof recursosTabela, T, unknown> & {
  meta?: { className?: string };
};

interface Props<T extends RowData> {
  colunas: Coluna<T>[];
  dados: T[] | undefined;
  carregando?: boolean;
  vazio?: ReactNode;
  linhaClassName?: (linha: T) => string | undefined;
  rotulo: string;
  /** Ordenação feita no servidor (paginação): a tabela só mostra e avisa a troca. */
  ordenacaoServidor?: {
    valor: SortingState;
    onChange: (s: SortingState) => void;
  };
}

/** Tabela com ordenação por coluna (TanStack Table v9), skeleton e estado vazio. */
export function DataTable<T extends RowData>({
  colunas,
  dados,
  carregando,
  vazio,
  linhaClassName,
  rotulo,
  ordenacaoServidor,
}: Props<T>) {
  const table = useTable({
    features: recursosTabela,
    columns: colunas,
    data: dados ?? [],
    ...(ordenacaoServidor
      ? {
          manualSorting: true,
          enableSortingRemoval: false,
          state: { sorting: ordenacaoServidor.valor },
          onSortingChange: (u) =>
            ordenacaoServidor.onChange(typeof u === 'function' ? u(ordenacaoServidor.valor) : u),
        }
      : {}),
  });

  const headers = table.getHeaderGroups();
  const linhas = table.getRowModel().rows;

  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
      <Table aria-label={rotulo}>
        <TableHeader>
          {headers.map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const podeOrdenar = h.column.getCanSort();
                const ordem = h.column.getIsSorted();
                const meta = (h.column.columnDef as Coluna<T>).meta;
                return (
                  <TableHead key={h.id} className={cn('bg-muted/40 h-10', meta?.className)}>
                    {h.isPlaceholder ? null : podeOrdenar ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
                      >
                        <FlexRender header={h} />
                        {ordem === 'asc' ? (
                          <ArrowUp className="size-3.5" />
                        ) : ordem === 'desc' ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      <FlexRender header={h} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {carregando ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {colunas.map((_c, j) => (
                  <TableCell key={j} className="py-3.5">
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : linhas.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colunas.length} className="p-0">
                {vazio}
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((r) => (
              <TableRow key={r.id} className={linhaClassName?.(r.original)}>
                {r.getAllCells().map((c) => {
                  const meta = (c.column.columnDef as Coluna<T>).meta;
                  return (
                    <TableCell key={c.id} className={cn('py-3', meta?.className)}>
                      <FlexRender cell={c} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
