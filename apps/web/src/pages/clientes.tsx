import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type Coluna } from '@/components/data-table';
import { Field, FormError } from '@/components/field';
import { EmptyState, Page, PageHeader, Segmentado } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Cliente } from '@/lib/api';
import { ehAdmin, useMe } from '@/lib/auth';
import { formatDocumento } from '@/lib/format';
import { useDebounce } from '@/lib/use-debounce';

type Status = 'ativos' | 'inativos' | 'todos';

export default function ClientesPage() {
  const { data: user } = useMe();
  const admin = ehAdmin(user);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('ativos');
  const termo = useDebounce(busca.trim(), 200);
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null);
  const [desativar, setDesativar] = useState<Cliente | null>(null);

  // Ctrl+K → "Novo cliente" abre o formulário.
  const alvo = editando ?? (params.get('novo') === '1' ? 'novo' : null);
  const fecharForm = () => {
    setEditando(null);
    if (params.has('novo')) setParams({}, { replace: true });
  };

  const lista = useQuery({
    queryKey: ['clients', { termo, status }],
    queryFn: async () =>
      (
        await api.get<{ clients: Cliente[] }>(
          `/api/clients?status=${status}&search=${encodeURIComponent(termo)}`,
        )
      ).clients,
    placeholderData: (anterior) => anterior,
  });

  const alternarAtivo = useMutation({
    mutationFn: (c: Cliente) =>
      api.post<{ client: Cliente }>(
        `/api/clients/${c.id}/${c.active ? 'deactivate' : 'reactivate'}`,
      ),
    onSuccess: ({ client }) => {
      toast.success(client.active ? `${client.name} reativado.` : `${client.name} desativado.`);
      setDesativar(null);
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const colunas: Coluna<Cliente>[] = [
    {
      accessorKey: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {row.original.notes && (
            <div className="text-muted-foreground max-w-xs truncate text-xs">
              {row.original.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'document',
      header: 'CNPJ / CPF',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {formatDocumento(row.original.document) || '—'}
        </span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    },
    {
      accessorKey: 'contact',
      header: 'Contato',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.contact ?? <span className="text-muted-foreground">—</span>}</div>
          {row.original.email && (
            <div className="text-muted-foreground text-xs">{row.original.email}</div>
          )}
        </div>
      ),
      meta: { className: 'hidden md:table-cell' },
    },
    {
      accessorKey: 'phone',
      header: 'Telefone',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">{row.original.phone ?? '—'}</span>
      ),
      meta: { className: 'hidden xl:table-cell' },
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="success">Ativo</Badge>
        ) : (
          <Badge variant="outline">Inativo</Badge>
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
              aria-label={`Ações de ${row.original.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditando(row.original)}>
              <Pencil />
              Editar
            </DropdownMenuItem>
            {admin && (
              <>
                <DropdownMenuSeparator />
                {row.original.active ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDesativar(row.original)}
                  >
                    <Power />
                    Desativar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => alternarAtivo.mutate(row.original)}>
                    <RotateCcw />
                    Reativar
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const total = lista.data?.length ?? 0;

  return (
    <Page>
      <PageHeader
        titulo="Clientes"
        descricao="Clientes desativados não aparecem em novas cotações, mas continuam no histórico."
        acoes={
          <Button onClick={() => setEditando('novo')}>
            <Plus />
            Novo cliente
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, contato, e-mail ou CNPJ…"
            className="pl-9"
            aria-label="Buscar clientes"
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
            { valor: 'ativos', rotulo: 'Ativos' },
            { valor: 'inativos', rotulo: 'Inativos' },
            { valor: 'todos', rotulo: 'Todos' },
          ]}
        />
        <div className="text-muted-foreground text-sm sm:ml-auto">
          {lista.isSuccess && `${total} ${total === 1 ? 'cliente' : 'clientes'}`}
        </div>
      </div>

      <DataTable
        rotulo="Lista de clientes"
        colunas={colunas}
        dados={lista.data}
        carregando={lista.isPending}
        linhaClassName={(c) => (c.active ? undefined : 'opacity-60')}
        vazio={
          termo ? (
            <EmptyState
              icone={Search}
              titulo="Nenhum cliente encontrado"
              descricao={`Nada corresponde a “${termo}”.`}
            />
          ) : (
            <EmptyState
              icone={Building2}
              titulo={
                status === 'inativos' ? 'Nenhum cliente desativado' : 'Nenhum cliente cadastrado'
              }
              descricao={
                status === 'inativos'
                  ? undefined
                  : 'Cadastre o primeiro cliente para usar nas cotações.'
              }
              acao={
                status !== 'inativos' && (
                  <Button onClick={() => setEditando('novo')}>
                    <Plus />
                    Novo cliente
                  </Button>
                )
              }
            />
          )
        }
      />

      <ClienteDialog cliente={alvo} onFechar={fecharForm} />

      <ConfirmDialog
        aberto={!!desativar}
        onAbertoChange={(v) => !v && setDesativar(null)}
        titulo="Desativar cliente?"
        descricao={
          <>
            <strong className="text-foreground">{desativar?.name}</strong> deixará de aparecer para
            novas cotações. O histórico continua mostrando o nome, e você pode reativá-lo depois.
          </>
        }
        confirmar="Desativar"
        carregando={alternarAtivo.isPending}
        onConfirmar={() => desativar && alternarAtivo.mutate(desativar)}
      />
    </Page>
  );
}

const VAZIO = { name: '', document: '', contact: '', email: '', phone: '', notes: '' };

function ClienteDialog({
  cliente,
  onFechar,
}: {
  cliente: Cliente | 'novo' | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!cliente} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {cliente && (
          <ClienteForm
            key={cliente === 'novo' ? 'novo' : cliente.id}
            cliente={cliente}
            onFechar={onFechar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClienteForm({ cliente, onFechar }: { cliente: Cliente | 'novo'; onFechar: () => void }) {
  const qc = useQueryClient();
  const novo = cliente === 'novo';
  const [form, setForm] = useState(() =>
    cliente === 'novo'
      ? VAZIO
      : {
          name: cliente.name,
          document: formatDocumento(cliente.document),
          contact: cliente.contact ?? '',
          email: cliente.email ?? '',
          phone: cliente.phone ?? '',
          notes: cliente.notes ?? '',
        },
  );

  const salvar = useMutation({
    mutationFn: () =>
      novo
        ? api.post<{ client: Cliente }>('/api/clients', form)
        : api.patch<{ client: Cliente }>(`/api/clients/${(cliente as Cliente).id}`, form),
    onSuccess: ({ client }) => {
      toast.success(novo ? `Cliente ${client.name} cadastrado.` : 'Alterações salvas.');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onFechar();
    },
  });

  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const erroDe = (campo: string) => (erro?.campo === campo ? erro.message : null);
  const set = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{novo ? 'Novo cliente' : 'Editar cliente'}</DialogTitle>
        <DialogDescription>Somente o nome é obrigatório.</DialogDescription>
      </DialogHeader>
      {erro && !erro.campo && <FormError mensagem={erro.message} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="c-nome"
          rotulo="Nome"
          obrigatorio
          erro={erroDe('name')}
          className="sm:col-span-2"
        >
          <Input
            id="c-nome"
            value={form.name}
            onChange={set('name')}
            autoFocus
            aria-invalid={!!erroDe('name')}
          />
        </Field>
        <Field id="c-doc" rotulo="CNPJ / CPF" erro={erroDe('document')}>
          <Input
            id="c-doc"
            value={form.document}
            onChange={set('document')}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            aria-invalid={!!erroDe('document')}
          />
        </Field>
        <Field id="c-contato" rotulo="Contato" erro={erroDe('contact')}>
          <Input id="c-contato" value={form.contact} onChange={set('contact')} />
        </Field>
        <Field id="c-email" rotulo="E-mail" erro={erroDe('email')}>
          <Input
            id="c-email"
            type="email"
            value={form.email}
            onChange={set('email')}
            aria-invalid={!!erroDe('email')}
          />
        </Field>
        <Field id="c-tel" rotulo="Telefone" erro={erroDe('phone')}>
          <Input
            id="c-tel"
            value={form.phone}
            onChange={set('phone')}
            inputMode="tel"
            placeholder="(11) 0000-0000"
          />
        </Field>
        <Field id="c-obs" rotulo="Observações" erro={erroDe('notes')} className="sm:col-span-2">
          <Textarea id="c-obs" value={form.notes} onChange={set('notes')} rows={3} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          {novo ? 'Cadastrar' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
