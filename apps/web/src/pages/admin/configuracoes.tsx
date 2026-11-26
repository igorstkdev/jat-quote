import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { RestaurarDemo } from '@/components/demo';
import { PlanoVigencia } from '@/components/plano-vigencia';
import { useEdicao } from '@/lib/edicao';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field, FormError } from '@/components/field';
import { EmptyState, Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError, type Configuracoes, type LinkRastreio, type LinkUtil } from '@/lib/api';
import { CHAVE_LINKS } from '@/lib/links';
import { ROTULO_VEICULO, VEICULOS_FTL } from '@jat/core';
import { CondicoesPorItem } from '@/components/editor-condicoes';

const CHAVE_CONFIG = ['settings'] as const;
const CHAVE_LINKS_ADMIN = ['links', 'admin'] as const;

export default function ConfiguracoesPage() {
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') ?? 'links';
  const { demo } = useEdicao();
  return (
    <Page className="max-w-5xl">
      <PageHeader
        titulo="Configurações"
        descricao="Valores padrão do sistema. Toda alteração fica registrada na auditoria."
      />
      <Tabs
        value={aba}
        onValueChange={(v) => setParams(v === 'links' ? {} : { aba: v }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="links">Links úteis</TabsTrigger>
          <TabsTrigger value="advalorem">Ad valorem</TabsTrigger>
          <TabsTrigger value="ftl">Condições FTL</TabsTrigger>
          <TabsTrigger value="spot">Condições Spot</TabsTrigger>
          <TabsTrigger value="rastreio">Links de rastreio</TabsTrigger>
          <TabsTrigger value="licenca">{demo ? 'Demonstração' : 'Plano de vigência'}</TabsTrigger>
        </TabsList>
        <TabsContent value="links" className="mt-4">
          <LinksUteis />
        </TabsContent>
        <TabsContent value="advalorem" className="mt-4">
          <AdValorem />
        </TabsContent>
        <TabsContent value="ftl" className="mt-4">
          <CondicoesFtl />
        </TabsContent>
        <TabsContent value="spot" className="mt-4">
          <CondicoesSpot />
        </TabsContent>
        <TabsContent value="rastreio" className="mt-4">
          <LinksRastreio />
        </TabsContent>
        <TabsContent value="licenca" className="mt-4">
          {demo ? <RestaurarDemo /> : <PlanoVigencia />}
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function useConfiguracoes() {
  return useQuery({
    queryKey: CHAVE_CONFIG,
    queryFn: () => api.get<Configuracoes>('/api/settings'),
  });
}

// ── Links úteis ──

function LinksUteis() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<LinkUtil | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<LinkUtil | null>(null);
  const lista = useQuery({
    queryKey: CHAVE_LINKS_ADMIN,
    queryFn: async () => (await api.get<{ links: LinkUtil[] }>('/api/links?all=1')).links,
  });
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: CHAVE_LINKS });
  };
  const patch = useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<LinkUtil> }) =>
      api.patch(`/api/links/${id}`, dados),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });
  const ordenar = useMutation({
    mutationFn: (ids: string[]) => api.put('/api/links/order', { ids }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (l: LinkUtil) => api.delete(`/api/links/${l.id}`),
    onSuccess: (_r, l) => {
      toast.success(`Link ${l.name} excluído.`);
      setExcluir(null);
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });

  const mover = (i: number, d: -1 | 1) => {
    const ids = (lista.data ?? []).map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    ordenar.mutate(ids);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>Links úteis</CardTitle>
          <CardDescription>
            Atalhos no menu lateral e na paleta de comandos, para todos os usuários.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditando('novo')}>
          <Plus /> Novo link
        </Button>
      </CardHeader>
      <CardContent>
        {lista.isPending ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !lista.data?.length ? (
          <EmptyState icone={Link2} titulo="Nenhum link cadastrado" className="py-10" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {lista.data.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    aria-label={`Subir ${l.name}`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === lista.data.length - 1}
                    onClick={() => mover(i, 1)}
                    aria-label={`Descer ${l.name}`}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.name}</div>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary inline-flex max-w-full items-center gap-1 truncate text-xs"
                  >
                    {l.url} <ExternalLink className="size-3 shrink-0" />
                  </a>
                </div>
                <Switch
                  checked={l.active}
                  onCheckedChange={(v) => patch.mutate({ id: l.id, dados: { active: v } })}
                  aria-label={`${l.active ? 'Ocultar' : 'Mostrar'} ${l.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditando(l)}
                  aria-label={`Editar ${l.name}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-8"
                  onClick={() => setExcluir(l)}
                  aria-label={`Excluir ${l.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <LinkDialog link={editando} onFechar={() => setEditando(null)} onSalvo={atualizar} />
      <ConfirmDialog
        aberto={!!excluir}
        onAbertoChange={(v) => !v && setExcluir(null)}
        titulo="Excluir link?"
        descricao={
          <>
            O atalho <strong className="text-foreground">{excluir?.name}</strong> sairá do menu de
            todos os usuários.
          </>
        }
        confirmar="Excluir"
        carregando={remover.isPending}
        onConfirmar={() => excluir && remover.mutate(excluir)}
      />
    </Card>
  );
}

function LinkDialog({
  link,
  onFechar,
  onSalvo,
}: {
  link: LinkUtil | 'novo' | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  return (
    <Dialog open={!!link} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {link && (
          <LinkForm
            key={link === 'novo' ? 'novo' : link.id}
            link={link}
            onFechar={onFechar}
            onSalvo={onSalvo}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  link,
  onFechar,
  onSalvo,
}: {
  link: LinkUtil | 'novo';
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const novo = link === 'novo';
  const [form, setForm] = useState(() =>
    link === 'novo' ? { name: '', url: 'https://' } : { name: link.name, url: link.url },
  );
  const salvar = useMutation({
    mutationFn: () =>
      novo ? api.post('/api/links', form) : api.patch(`/api/links/${(link as LinkUtil).id}`, form),
    onSuccess: () => {
      toast.success(novo ? 'Link criado.' : 'Link atualizado.');
      onSalvo();
      onFechar();
    },
  });
  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };
  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{novo ? 'Novo link' : 'Editar link'}</DialogTitle>
        <DialogDescription>Abre em uma nova aba.</DialogDescription>
      </DialogHeader>
      {erro && !erro.campo && <FormError mensagem={erro.message} />}
      <Field
        id="l-nome"
        rotulo="Nome"
        obrigatorio
        erro={erro?.campo === 'name' ? erro.message : null}
      >
        <Input
          id="l-nome"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
        />
      </Field>
      <Field
        id="l-url"
        rotulo="Endereço (URL)"
        obrigatorio
        erro={erro?.campo === 'url' ? erro.message : null}
      >
        <Input
          id="l-url"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          inputMode="url"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Ad valorem ──

function AdValorem() {
  const qc = useQueryClient();
  const cfg = useConfiguracoes();
  // Rascunho só existe depois que o Admin edita; antes mostra o valor salvo.
  const [rascunho, setRascunho] = useState<{ AEREO: string; RODOVIARIO: string } | null>(null);
  const salvo = {
    AEREO: cfg.data?.adValorem.AEREO.replace('.', ',') ?? '',
    RODOVIARIO: cfg.data?.adValorem.RODOVIARIO.replace('.', ',') ?? '',
  };
  const form = rascunho ?? salvo;
  const setForm = (fn: (f: typeof salvo) => typeof salvo) => setRascunho(fn(form));
  const salvar = useMutation({
    mutationFn: () => api.put('/api/settings/ad-valorem', form),
    onSuccess: () => {
      setRascunho(null);
      toast.success('Padrões de ad valorem salvos.');
      void qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad valorem padrão</CardTitle>
        <CardDescription>
          Valor sugerido em cada nova cotação Spot, editável por cotação. É apenas informativo:
          nunca entra no total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cfg.isPending ? (
          <Skeleton className="h-24 w-full max-w-md" />
        ) : (
          <form onSubmit={enviar} className="grid max-w-md gap-4" noValidate>
            <FormError mensagem={salvar.error?.message} />
            <div className="grid grid-cols-2 gap-4">
              {(['AEREO', 'RODOVIARIO'] as const).map((m) => (
                <div key={m} className="grid gap-1.5">
                  <Label htmlFor={`av-${m}`}>{m === 'AEREO' ? 'Aéreo' : 'Rodoviário'}</Label>
                  <div className="relative">
                    <Input
                      id={`av-${m}`}
                      value={form[m]}
                      inputMode="decimal"
                      onChange={(e) => setForm((f) => ({ ...f, [m]: e.target.value }))}
                      className="tabular pr-8"
                    />
                    <span className="text-muted-foreground absolute inset-y-0 right-3 flex items-center text-sm">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending && <Loader2 className="animate-spin" />}
                Salvar padrões
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ── Condições comerciais do FTL (uma por veículo) e Spot (uma por modal) — 17/11/2026 ──

function CondicoesFtl() {
  const cfg = useConfiguracoes();
  return (
    <CondicoesPorItem
      titulo="Condições comerciais do FTL"
      descricao="Uma para cada veículo. Aparecem no resultado da calculadora FTL, no PDF, no texto copiado e no e-mail, e ficam gravadas em cada cotação ao salvar."
      itens={VEICULOS_FTL.map((v) => ({ chave: v, rotulo: ROTULO_VEICULO[v] }))}
      valores={cfg.data?.condicoesFtl}
      carregando={cfg.isPending}
      endpoint="/api/settings/ftl-conditions"
      mensagemSalvo="Condições comerciais do FTL salvas."
      chaveConfig={CHAVE_CONFIG}
    />
  );
}

function CondicoesSpot() {
  const cfg = useConfiguracoes();
  return (
    <CondicoesPorItem
      titulo="Termos e condições do Frete Spot"
      descricao="Um conjunto para cada modal. Aparecem na prévia (abaixo do Total do Frete), nos PDFs, no texto copiado e no e-mail, e ficam gravados em cada cotação ao salvar."
      itens={[
        { chave: 'RODOVIARIO' as const, rotulo: 'Rodoviário' },
        { chave: 'AEREO' as const, rotulo: 'Aéreo' },
      ]}
      valores={cfg.data?.condicoesSpot}
      carregando={cfg.isPending}
      endpoint="/api/settings/spot-conditions"
      mensagemSalvo="Termos e condições do Frete Spot salvos."
      chaveConfig={CHAVE_CONFIG}
    />
  );
}

// ── Links de rastreio (tela de Tarifas Aéreas) ──

function LinksRastreio() {
  const qc = useQueryClient();
  const cfg = useConfiguracoes();
  const [rascunho, setRascunho] = useState<LinkRastreio[] | null>(null);
  const links = rascunho ?? cfg.data?.linksRastreio ?? [];
  const mudou = cfg.data ? JSON.stringify(links) !== JSON.stringify(cfg.data.linksRastreio) : false;
  const set = (i: number, k: keyof LinkRastreio, v: string) =>
    setRascunho(links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const salvar = useMutation({
    mutationFn: () => api.put('/api/settings/tracking-links', { links }),
    onSuccess: () => {
      setRascunho(null);
      toast.success('Links de rastreio salvos.');
      void qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Links de rastreio</CardTitle>
        <CardDescription>
          Aparecem na tela de Tarifas Aéreas, para rastrear cargas nas companhias.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {cfg.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <FormError mensagem={salvar.error?.message} />
            {links.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum link de rastreio.</p>
            )}
            {links.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
                <Input
                  value={l.name}
                  onChange={(e) => set(i, 'name', e.target.value)}
                  aria-label={`Nome do link ${i + 1}`}
                  placeholder="Nome"
                />
                <Input
                  value={l.url}
                  onChange={(e) => set(i, 'url', e.target.value)}
                  aria-label={`Endereço do link ${i + 1}`}
                  placeholder="https://"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${l.name || 'link'}`}
                  onClick={() => setRascunho(links.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setRascunho([...links, { name: '', url: '' }])}
                disabled={links.length >= 10}
              >
                <Plus /> Adicionar link
              </Button>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !mudou}>
                {salvar.isPending && <Loader2 className="animate-spin" />}
                Salvar links
              </Button>
              {mudou && (
                <Button variant="ghost" onClick={() => setRascunho(null)}>
                  Descartar alterações
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
