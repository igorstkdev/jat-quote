import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  UserCog,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type Coluna } from '@/components/data-table';
import { Field, FormError } from '@/components/field';
import { ROTULO_PERFIL } from '@/components/layout/user-menu';
import { EmptyState, Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, type Role, type Usuario } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { formatDataHora, iniciais } from '@/lib/format';

const CHAVE = ['users'] as const;

export default function UsuariosPage() {
  const { data: eu } = useMe();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);
  const [senha, setSenha] = useState<{ nome: string; username: string; senha: string } | null>(
    null,
  );
  const [confirmar, setConfirmar] = useState<{ tipo: 'desativar' | 'senha'; user: Usuario } | null>(
    null,
  );

  const alvo = editando ?? (params.get('novo') === '1' ? 'novo' : null);
  const fecharForm = () => {
    setEditando(null);
    if (params.has('novo')) setParams({}, { replace: true });
  };

  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: async () => (await api.get<{ users: Usuario[] }>('/api/users')).users,
  });

  const patch = useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<Usuario> }) =>
      api.patch<{ user: Usuario }>(`/api/users/${id}`, dados),
    onSuccess: ({ user }, { dados }) => {
      if (dados.active === false)
        toast.success(`${user.name} desativado. As sessões dele foram encerradas.`);
      else if (dados.active === true) toast.success(`${user.name} reativado.`);
      setConfirmar(null);
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e.message),
  });

  const redefinir = useMutation({
    mutationFn: (u: Usuario) =>
      api.post<{ senhaTemporaria: string }>(`/api/users/${u.id}/reset-password`),
    onSuccess: ({ senhaTemporaria }, u) => {
      setConfirmar(null);
      setSenha({ nome: u.name, username: u.username, senha: senhaTemporaria });
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e.message),
  });

  const colunas: Coluna<Usuario>[] = [
    {
      accessorKey: 'name',
      header: 'Usuário',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {iniciais(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                {u.name}
                {u.id === eu?.id && (
                  <span className="text-muted-foreground text-xs font-normal">(você)</span>
                )}
              </div>
              <div className="text-muted-foreground text-xs">@{u.username}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'role',
      header: 'Perfil',
      cell: ({ row }) =>
        row.original.role === 'ADMIN' ? (
          <Badge>Admin</Badge>
        ) : (
          <Badge variant="outline">Operacional</Badge>
        ),
    },
    {
      accessorKey: 'canEditRates',
      header: 'Edita tarifas',
      cell: ({ row }) =>
        row.original.role === 'ADMIN' || row.original.canEditRates ? (
          <span className="text-success inline-flex items-center gap-1 text-sm">
            <Check className="size-4" /> Sim
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">Não</span>
        ),
      meta: { className: 'hidden md:table-cell' },
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => {
        const u = row.original;
        if (!u.active) return <Badge variant="outline">Inativo</Badge>;
        if (u.locked)
          return (
            <Badge variant="destructive">
              <Lock /> Bloqueado
            </Badge>
          );
        if (u.mustChangePassword) return <Badge variant="outline">Aguardando 1º acesso</Badge>;
        return <Badge variant="success">Ativo</Badge>;
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Último acesso',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground text-sm">
          {row.original.lastLoginAt ? formatDataHora(row.original.lastLoginAt) : 'Nunca'}
        </span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    },
    {
      id: 'acoes',
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      meta: { className: 'w-12 text-right' },
      cell: ({ row }) => {
        const u = row.original;
        const souEu = u.id === eu?.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Ações de ${u.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditando(u)}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmar({ tipo: 'senha', user: u })}>
                <KeyRound /> Redefinir senha
              </DropdownMenuItem>
              {!souEu && (
                <>
                  <DropdownMenuSeparator />
                  {u.active ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmar({ tipo: 'desativar', user: u })}
                    >
                      <Power /> Desativar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => patch.mutate({ id: u.id, dados: { active: true } })}
                    >
                      <RotateCcw /> Reativar
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        titulo="Usuários"
        descricao="Usuários nunca são excluídos: desative para bloquear o acesso e manter o histórico."
        acoes={
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Novo usuário
          </Button>
        }
      />
      <DataTable
        rotulo="Lista de usuários"
        colunas={colunas}
        dados={lista.data}
        carregando={lista.isPending}
        linhaClassName={(u) => (u.active ? undefined : 'opacity-60')}
        vazio={<EmptyState icone={UserCog} titulo="Nenhum usuário" />}
      />

      <UsuarioDialog
        usuario={alvo}
        souEu={alvo !== 'novo' && alvo?.id === eu?.id}
        onFechar={fecharForm}
        onCriado={(u, s) => setSenha({ nome: u.name, username: u.username, senha: s })}
      />
      <SenhaTemporariaDialog dados={senha} onFechar={() => setSenha(null)} />

      <ConfirmDialog
        aberto={confirmar?.tipo === 'desativar'}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo="Desativar usuário?"
        descricao={
          <>
            <strong className="text-foreground">{confirmar?.user.name}</strong> perde o acesso na
            hora e as sessões abertas são encerradas. O histórico é mantido.
          </>
        }
        confirmar="Desativar"
        carregando={patch.isPending}
        onConfirmar={() =>
          confirmar && patch.mutate({ id: confirmar.user.id, dados: { active: false } })
        }
      />
      <ConfirmDialog
        aberto={confirmar?.tipo === 'senha'}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo="Redefinir senha?"
        descricao={
          <>
            Uma senha temporária será gerada para{' '}
            <strong className="text-foreground">{confirmar?.user.name}</strong>. A senha atual deixa
            de funcionar e a troca será obrigatória no próximo acesso.
          </>
        }
        confirmar="Gerar senha temporária"
        destrutivo={false}
        carregando={redefinir.isPending}
        onConfirmar={() => confirmar && redefinir.mutate(confirmar.user)}
      />
    </Page>
  );
}

function UsuarioDialog({
  usuario,
  souEu,
  onFechar,
  onCriado,
}: {
  usuario: Usuario | 'novo' | null;
  souEu: boolean;
  onFechar: () => void;
  onCriado: (u: Usuario, senha: string) => void;
}) {
  return (
    <Dialog open={!!usuario} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {usuario && (
          <UsuarioForm
            key={usuario === 'novo' ? 'novo' : usuario.id}
            usuario={usuario}
            souEu={souEu}
            onFechar={onFechar}
            onCriado={onCriado}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UsuarioForm({
  usuario,
  souEu,
  onFechar,
  onCriado,
}: {
  usuario: Usuario | 'novo';
  souEu: boolean;
  onFechar: () => void;
  onCriado: (u: Usuario, senha: string) => void;
}) {
  const qc = useQueryClient();
  const novo = usuario === 'novo';
  const [form, setForm] = useState(() =>
    usuario === 'novo'
      ? { username: '', name: '', role: 'OPERACIONAL' as Role, canEditRates: false }
      : {
          username: usuario.username,
          name: usuario.name,
          role: usuario.role,
          canEditRates: usuario.canEditRates,
        },
  );

  const salvar = useMutation({
    mutationFn: async () => {
      if (novo) return api.post<{ user: Usuario; senhaTemporaria: string }>('/api/users', form);
      return api.patch<{ user: Usuario }>(`/api/users/${(usuario as Usuario).id}`, {
        name: form.name,
        role: form.role,
        canEditRates: form.canEditRates,
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CHAVE });
      onFechar();
      if ('senhaTemporaria' in r)
        onCriado(r.user, (r as { senhaTemporaria: string }).senhaTemporaria);
      else toast.success('Alterações salvas.');
    },
  });
  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const erroDe = (c: string) => (erro?.campo === c ? erro.message : null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{novo ? 'Novo usuário' : 'Editar usuário'}</DialogTitle>
        <DialogDescription>
          {novo
            ? 'Uma senha temporária será gerada. A troca é obrigatória no primeiro acesso.'
            : `@${form.username}`}
        </DialogDescription>
      </DialogHeader>
      {erro && !erro.campo && <FormError mensagem={erro.message} />}
      <Field id="u-nome" rotulo="Nome" obrigatorio erro={erroDe('name')}>
        <Input
          id="u-nome"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
        />
      </Field>
      {novo && (
        <Field
          id="u-login"
          rotulo="Usuário (login)"
          obrigatorio
          erro={erroDe('username')}
          dica="Letras sem acento, números, ponto ou hífen. Ex.: maria.souza"
        >
          <Input
            id="u-login"
            value={form.username}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
          />
        </Field>
      )}
      <Field
        id="u-perfil"
        rotulo="Perfil"
        erro={erroDe('role')}
        dica={souEu ? 'Você não pode alterar o próprio perfil.' : undefined}
      >
        <Select
          value={form.role}
          onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
          disabled={souEu}
        >
          <SelectTrigger id="u-perfil" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OPERACIONAL">
              {ROTULO_PERFIL.OPERACIONAL} — cotações, tarifas e relatórios
            </SelectItem>
            <SelectItem value="ADMIN">{ROTULO_PERFIL.ADMIN} — acesso total</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="grid gap-0.5">
          <Label htmlFor="u-tarifas">Pode editar tarifas</Label>
          <p className="text-muted-foreground text-xs">
            {form.role === 'ADMIN'
              ? 'Admins sempre podem editar tarifas.'
              : 'Cadastrar e alterar tarifas aéreas e tabelas FTL.'}
          </p>
        </div>
        <Switch
          id="u-tarifas"
          checked={form.role === 'ADMIN' || form.canEditRates}
          disabled={form.role === 'ADMIN'}
          onCheckedChange={(v) => setForm((f) => ({ ...f, canEditRates: v }))}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          {novo ? 'Criar usuário' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SenhaTemporariaDialog({
  dados,
  onFechar,
}: {
  dados: { nome: string; username: string; senha: string } | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!dados} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {dados && <SenhaTemporariaConteudo key={dados.senha} dados={dados} onFechar={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}

function SenhaTemporariaConteudo({
  dados,
  onFechar,
}: {
  dados: { nome: string; username: string; senha: string };
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(
        `Usuário: ${dados.username}\nSenha temporária: ${dados.senha}`,
      );
      setCopiado(true);
      toast.success('Dados de acesso copiados.');
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Senha temporária</DialogTitle>
        <DialogDescription>
          Entregue estes dados a {dados.nome}. A senha é mostrada <strong>só agora</strong> e
          precisa ser trocada no primeiro acesso.
        </DialogDescription>
      </DialogHeader>
      <div className="bg-muted/60 grid gap-3 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Usuário</span>
          <span className="font-medium">{dados.username}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Senha</span>
          <code
            className="bg-background rounded-md border px-2.5 py-1 font-mono text-base tracking-wider select-all"
            data-testid="senha-temporaria"
          >
            {dados.senha}
          </code>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={copiar}>
          {copiado ? <Check /> : <Copy />}
          {copiado ? 'Copiado' : 'Copiar dados'}
        </Button>
        <Button onClick={onFechar}>Concluir</Button>
      </DialogFooter>
    </>
  );
}
