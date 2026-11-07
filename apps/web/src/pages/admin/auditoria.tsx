import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Coluna } from '@/components/data-table';
import { DateInput } from '@/components/date-input';
import { EmptyState, Page, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, type RegistroAuditoria } from '@/lib/api';
import { formatDataHora } from '@/lib/format';
import { useDebounce } from '@/lib/use-debounce';

const ENTIDADES: Record<string, string> = {
  sessao: 'Acesso',
  usuario: 'Usuário',
  cliente: 'Cliente',
  cotacao: 'Cotação',
  tarifa_aerea: 'Tarifa aérea',
  tabela_ftl: 'Tabela FTL',
  configuracao: 'Configuração',
  link: 'Link útil',
};

const ACOES: Record<
  string,
  { rotulo: string; variante: 'default' | 'success' | 'destructive' | 'outline' }
> = {
  LOGIN: { rotulo: 'Login', variante: 'outline' },
  LOGOUT: { rotulo: 'Logout', variante: 'outline' },
  LOGIN_FALHOU: { rotulo: 'Login falhou', variante: 'destructive' },
  LOGIN_BLOQUEADO: { rotulo: 'Login bloqueado', variante: 'destructive' },
  SENHA_ALTERADA: { rotulo: 'Senha alterada', variante: 'default' },
  SENHA_REDEFINIDA: { rotulo: 'Senha redefinida', variante: 'default' },
  CRIAR: { rotulo: 'Criou', variante: 'success' },
  EDITAR: { rotulo: 'Editou', variante: 'default' },
  EXCLUIR: { rotulo: 'Excluiu', variante: 'destructive' },
  DESATIVAR: { rotulo: 'Desativou', variante: 'destructive' },
  REATIVAR: { rotulo: 'Reativou', variante: 'success' },
  STATUS: { rotulo: 'Mudou status', variante: 'default' },
};

const ROTULO_CAMPO: Record<string, string> = {
  name: 'Nome',
  role: 'Perfil',
  canEditRates: 'Edita tarifas',
  active: 'Ativo',
  document: 'Documento',
  contact: 'Contato',
  email: 'E-mail',
  phone: 'Telefone',
  notes: 'Observações',
  url: 'URL',
  AEREO: 'Aéreo (%)',
  RODOVIARIO: 'Rodoviário (%)',
  texto: 'Texto',
  username: 'Usuário',
  motivo: 'Motivo',
};

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function Detalhes({ d }: { d: unknown }) {
  if (!d || typeof d !== 'object') return <span className="text-muted-foreground">—</span>;
  const entradas = Object.entries(d as Record<string, unknown>);
  return (
    <ul className="grid gap-0.5 text-xs">
      {entradas.map(([k, v]) => {
        const mud =
          v && typeof v === 'object' && 'de' in v && 'para' in v
            ? (v as { de: unknown; para: unknown })
            : null;
        return (
          <li key={k}>
            <span className="text-muted-foreground">{ROTULO_CAMPO[k] ?? k}:</span>{' '}
            {mud ? (
              <>
                <span className="line-through opacity-60">{valor(mud.de)}</span> →{' '}
                <span className="font-medium">{valor(mud.para)}</span>
              </>
            ) : (
              <span className="font-medium">{valor(v)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function AuditoriaPage() {
  const [entidade, setEntidade] = useState('todas');
  const [usuario, setUsuario] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const user = useDebounce(usuario.trim(), 300);
  const tamanho = 50;

  const q = new URLSearchParams({ page: String(pagina), pageSize: String(tamanho) });
  if (entidade !== 'todas') q.set('entity', entidade);
  if (user) q.set('username', user);
  if (de) q.set('from', de);
  if (ate) q.set('to', ate);

  const lista = useQuery({
    queryKey: ['audit', q.toString()],
    queryFn: () =>
      api.get<{ total: number; logs: RegistroAuditoria[] }>(`/api/audit?${q.toString()}`),
    placeholderData: (a) => a,
  });

  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const filtro =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setPagina(1);
      fn(v);
    };

  const colunas: Coluna<RegistroAuditoria>[] = [
    {
      accessorKey: 'at',
      header: 'Data e hora',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular text-sm whitespace-nowrap">{formatDataHora(row.original.at)}</span>
      ),
    },
    {
      accessorKey: 'username',
      header: 'Usuário',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-medium">{row.original.username ?? '—'}</div>
          {row.original.ip && (
            <div className="text-muted-foreground text-xs">{row.original.ip}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Ação',
      enableSorting: false,
      cell: ({ row }) => {
        const a = ACOES[row.original.action];
        return <Badge variant={a?.variante ?? 'outline'}>{a?.rotulo ?? row.original.action}</Badge>;
      },
    },
    {
      accessorKey: 'entity',
      header: 'Onde',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm">{ENTIDADES[row.original.entity] ?? row.original.entity}</span>
      ),
    },
    {
      accessorKey: 'details',
      header: 'Detalhes',
      enableSorting: false,
      cell: ({ row }) => <Detalhes d={row.original.details} />,
      meta: { className: 'hidden md:table-cell' },
    },
  ];

  return (
    <Page>
      <PageHeader
        titulo="Auditoria"
        descricao="Registro de acessos e alterações. Somente leitura."
      />
      <div className="bg-card mb-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="f-entidade">Onde</Label>
          <Select value={entidade} onValueChange={filtro(setEntidade)}>
            <SelectTrigger id="f-entidade" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Tudo</SelectItem>
              {Object.entries(ENTIDADES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-usuario">Usuário</Label>
          <Input
            id="f-usuario"
            value={usuario}
            onChange={(e) => filtro(setUsuario)(e.target.value)}
            placeholder="Login"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-de">De</Label>
          <DateInput id="f-de" valor={de} onChange={filtro(setDe)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-ate">Até</Label>
          <DateInput id="f-ate" valor={ate} onChange={filtro(setAte)} />
        </div>
      </div>

      <DataTable
        rotulo="Registros de auditoria"
        colunas={colunas}
        dados={lista.data?.logs}
        carregando={lista.isPending}
        vazio={<EmptyState icone={ScrollText} titulo="Nenhum registro no período" />}
      />

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground tabular">
          {total} {total === 1 ? 'registro' : 'registros'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            <ChevronLeft /> Anterior
          </Button>
          <span className="tabular text-muted-foreground">
            {pagina} de {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima <ChevronRight />
          </Button>
        </div>
      </div>
    </Page>
  );
}
