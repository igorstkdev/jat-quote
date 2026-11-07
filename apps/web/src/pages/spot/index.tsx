import { formatarCidade, formatPercentual, linkEmailCotacao, textoCotacao } from '@jat/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Copy,
  Eraser,
  FileDown,
  History,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package,
  Plane,
  Save,
  Truck,
  Files,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CityCombobox } from '@/components/city-combobox';
import { ClientCombobox } from '@/components/client-combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type ComponenteSpot, type Configuracoes, type Cotacao } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  apagarRascunho,
  calcular,
  FORM_VAZIO,
  formDaCotacao,
  formVazioOuIgual,
  idDoCampo,
  lerRascunho,
  payloadDoForm,
  salvarRascunho,
  type FormSpot,
  type ModalSpot,
} from './estado';
import { CotacoesRecentes } from './recentes';
import { PainelResultado } from './resultado';

const CAMPOS_CUSTO: Record<
  ModalSpot,
  { id: ComponenteSpot; rotulo: string; icone: typeof Truck }[]
> = {
  RODOVIARIO: [{ id: 'RODOVIARIO', rotulo: 'Custo rodoviário', icone: Truck }],
  AEREO: [
    { id: 'COLETA', rotulo: 'Custo de coleta', icone: MapPin },
    { id: 'AEREO', rotulo: 'Custo aéreo', icone: Plane },
    { id: 'ENTREGA', rotulo: 'Custo de entrega', icone: Package },
  ],
};

export default function SpotPage() {
  const { data: user } = useMe();
  const userId = user!.id;
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Configuracoes>('/api/settings'),
  });

  // Estado inicial vem do rascunho local (por usuário).
  const [inicial] = useState(() => lerRascunho(userId));
  const [form, setForm] = useState<FormSpot>(inicial?.form ?? FORM_VAZIO);
  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [base, setBase] = useState<FormSpot>(FORM_VAZIO);
  const [recentes, setRecentes] = useState(false);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [erroServidor, setErroServidor] = useState<ApiError | null>(null);

  // Rascunho que estava editando uma cotação salva: recarrega a cotação.
  const editandoInicial = inicial?.editandoId;
  const carregada = useQuery({
    queryKey: ['quote', editandoInicial],
    queryFn: async () =>
      (await api.get<{ quote: Cotacao }>(`/api/quotes/${editandoInicial}`)).quote,
    enabled: !!editandoInicial,
    retry: false,
  });
  const [sincronizado, setSincronizado] = useState(false);
  if (carregada.data && !sincronizado) {
    setSincronizado(true);
    setCotacao(carregada.data);
    setBase(formDaCotacao(carregada.data));
  }

  useEffect(() => {
    const t = setTimeout(
      () => salvarRascunho(userId, { form, editandoId: cotacao?.id ?? null }),
      250,
    );
    return () => clearTimeout(t);
  }, [form, cotacao, userId]);

  const { resultado, erro } = useMemo(() => calcular(form, cfg.data), [form, cfg.data]);
  const alterado = cotacao ? !formVazioOuIgual(form, base) : false;
  const somenteLeitura = cotacao?.status === 'APROVADA';
  const vazio = formVazioOuIgual(form, FORM_VAZIO);

  const erroDe = (id: string) => {
    if (erroServidor && idDoCampo(erroServidor.campo) === id) return erroServidor.message;
    if (erro && idDoCampo(erro.campo) === id) return erro.message;
    return null;
  };

  const set = <K extends keyof FormSpot>(k: K, v: FormSpot[K]) => {
    setErroServidor(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setCusto = (c: ComponenteSpot, v: string) => {
    setErroServidor(null);
    setForm((f) => ({ ...f, custos: { ...f.custos, [c]: v } }));
  };

  const abrir = useCallback((q: Cotacao) => {
    const f = formDaCotacao(q);
    setCotacao(q);
    setBase(f);
    setForm(f);
    setErroServidor(null);
    setRecentes(false);
  }, []);

  const salvar = useMutation({
    mutationFn: async () => {
      const p = payloadDoForm(form);
      const r = cotacao
        ? await api.patch<{ quote: Cotacao }>(`/api/quotes/${cotacao.id}`, p)
        : await api.post<{ quote: Cotacao }>('/api/quotes', p);
      return r.quote;
    },
    onSuccess: (q) => {
      abrir(q);
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      toast.success(`Cotação ${q.code} salva.`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErroServidor(e);
        const id = idDoCampo(e.campo);
        if (id) document.getElementById(id)?.focus();
      }
      toast.error(e.message);
    },
  });

  const duplicar = useMutation({
    mutationFn: async () =>
      (await api.post<{ quote: Cotacao }>(`/api/quotes/${cotacao!.id}/duplicate`)).quote,
    onSuccess: (q) => {
      abrir(q);
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      toast.success(`Nova cotação ${q.code} criada a partir da anterior.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const limpar = () => {
    setForm(FORM_VAZIO);
    setBase(FORM_VAZIO);
    setCotacao(null);
    setErroServidor(null);
    apagarRascunho(userId);
    setConfirmarLimpar(false);
  };

  const dadosTexto = () => {
    if (!resultado || !form.cliente || !form.origem || !form.destino) {
      toast.error('Preencha cliente, origem, destino e custos primeiro.');
      return null;
    }
    return {
      numero: cotacao && !alterado ? cotacao.number : null,
      cliente: form.cliente.name,
      origem: formatarCidade(form.origem),
      destino: formatarCidade(form.destino),
      modal: form.modal,
      data: cotacao ? new Date(cotacao.createdAt) : new Date(),
      total: resultado.total,
      adValoremPct: resultado.adValorem.pct,
      observacoes: form.obs,
    };
  };

  const copiar = async () => {
    const d = dadosTexto();
    if (!d) return;
    try {
      await navigator.clipboard.writeText(textoCotacao(d, { whatsapp: true }));
      toast.success(
        alterado
          ? 'Texto copiado (há alterações não salvas: o número não foi incluído).'
          : 'Texto da cotação copiado.',
      );
    } catch {
      toast.error('Não foi possível copiar. Verifique a permissão da área de transferência.');
    }
  };

  const email = () => {
    const d = dadosTexto();
    if (!d) return;
    window.location.href = linkEmailCotacao(d, form.cliente?.email);
  };

  /** PDF exige cotação salva: salva antes, se preciso, e abre em nova aba. */
  const pdf = async (visao: 'cliente' | 'operacao') => {
    const janela = window.open('', '_blank');
    try {
      let q = cotacao;
      if (!q || alterado) {
        if (somenteLeitura) throw new Error('Cotação aprovada não pode ser alterada.');
        q = await salvar.mutateAsync();
      }
      const url = `/api/quotes/${q.id}/pdf?visao=${visao}`;
      if (janela) janela.location.href = url;
      else window.open(url, '_blank');
    } catch {
      janela?.close();
    }
  };

  // Atalhos: Ctrl+S salvar, Ctrl+Shift+C copiar, Ctrl+P PDF do cliente.
  const atalhos = useRef({ salvar: () => {}, copiar: () => {}, pdf: () => {} });
  useEffect(() => {
    atalhos.current = {
      salvar: () => !somenteLeitura && !salvar.isPending && salvar.mutate(),
      copiar: () => void copiar(),
      pdf: () => void pdf('cliente'),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's' && !e.shiftKey) {
        e.preventDefault();
        atalhos.current.salvar();
      } else if (k === 'c' && e.shiftKey) {
        e.preventDefault();
        atalhos.current.copiar();
      } else if (k === 'p' && !e.shiftKey) {
        e.preventDefault();
        atalhos.current.pdf();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const padraoAv = cfg.data?.adValorem[form.modal];

  return (
    <Page>
      <PageHeader
        titulo="Frete Spot"
        descricao="Cotação de frete aéreo e rodoviário. O resultado é atualizado enquanto você digita."
        acoes={
          <Button variant="outline" onClick={() => setRecentes(true)}>
            <History /> Cotações recentes
          </Button>
        }
      />

      {somenteLeitura && (
        <div className="border-status-aprovada/30 bg-status-aprovada/8 mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Lock className="text-status-aprovada size-4" />
            <span>
              A cotação <strong>{cotacao?.code}</strong> foi aprovada e não pode ser editada.
            </span>
          </div>
          <Button size="sm" onClick={() => duplicar.mutate()} disabled={duplicar.isPending}>
            {duplicar.isPending ? <Loader2 className="animate-spin" /> : <Files />} Duplicar como
            nova
          </Button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          noValidate
          className="bg-card rounded-2xl border shadow-sm"
        >
          <fieldset disabled={somenteLeitura} className="grid gap-5 p-6">
            <legend className="sr-only">Dados do frete</legend>
            <Field id="spot-cliente" rotulo="Cliente" obrigatorio erro={erroDe('spot-cliente')}>
              <ClientCombobox
                id="spot-cliente"
                valor={form.cliente}
                onChange={(c) => set('cliente', c)}
                invalido={!!erroDe('spot-cliente')}
                disabled={somenteLeitura}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="spot-origem" rotulo="Origem" obrigatorio erro={erroDe('spot-origem')}>
                <CityCombobox
                  id="spot-origem"
                  valor={form.origem}
                  onChange={(c) => set('origem', c)}
                  placeholder="Cidade de origem"
                  invalido={!!erroDe('spot-origem')}
                  disabled={somenteLeitura}
                />
              </Field>
              <Field id="spot-destino" rotulo="Destino" obrigatorio erro={erroDe('spot-destino')}>
                <CityCombobox
                  id="spot-destino"
                  valor={form.destino}
                  onChange={(c) => set('destino', c)}
                  placeholder="Cidade de destino"
                  invalido={!!erroDe('spot-destino')}
                  disabled={somenteLeitura}
                />
              </Field>
            </div>

            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Tipo de transporte</span>
              <div
                role="radiogroup"
                aria-label="Tipo de transporte"
                className="grid grid-cols-2 gap-2"
              >
                {(['RODOVIARIO', 'AEREO'] as const).map((m) => {
                  const Icone = m === 'AEREO' ? Plane : Truck;
                  const ativo = form.modal === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => set('modal', m)}
                      className={cn(
                        'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-all',
                        ativo
                          ? 'border-primary bg-primary/8 text-primary ring-primary/20 ring-2'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <Icone className="size-4" />
                      {m === 'AEREO' ? 'Aéreo' : 'Rodoviário'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={cn('grid gap-4', form.modal === 'AEREO' && 'sm:grid-cols-3')}>
              {CAMPOS_CUSTO[form.modal].map((c) => (
                <Field
                  key={c.id}
                  id={`spot-custo-${c.id}`}
                  rotulo={c.rotulo}
                  erro={erroDe(`spot-custo-${c.id}`)}
                >
                  <NumberInput
                    id={`spot-custo-${c.id}`}
                    valor={form.custos[c.id]}
                    onValor={(v) => setCusto(c.id, v)}
                    casasFixas={2}
                    prefixo="R$"
                    placeholder="0,00"
                    aria-invalid={!!erroDe(`spot-custo-${c.id}`)}
                  />
                </Field>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="spot-pedagio" rotulo="Pedágio" erro={erroDe('spot-pedagio')}>
                <NumberInput
                  id="spot-pedagio"
                  valor={form.pedagio}
                  onValor={(v) => set('pedagio', v)}
                  casasFixas={2}
                  prefixo="R$"
                  placeholder="0,00"
                />
              </Field>
              <Field id="spot-markup" rotulo="Markup" erro={erroDe('spot-markup')}>
                <NumberInput
                  id="spot-markup"
                  valor={form.markup}
                  onValor={(v) => set('markup', v)}
                  casas={4}
                  sufixo="%"
                  placeholder="0"
                  aria-invalid={!!erroDe('spot-markup')}
                />
              </Field>
              <Field
                id="spot-advalorem"
                rotulo="Ad valorem"
                erro={erroDe('spot-advalorem')}
                dica={padraoAv ? `Em branco: padrão ${formatPercentual(padraoAv)}` : undefined}
              >
                <NumberInput
                  id="spot-advalorem"
                  valor={form.adValorem}
                  onValor={(v) => set('adValorem', v)}
                  casas={4}
                  sufixo="%"
                  placeholder={padraoAv ? padraoAv.replace('.', ',') : ''}
                />
              </Field>
            </div>

            <Field
              id="spot-mercadoria"
              rotulo="Valor estimado da mercadoria (opcional)"
              erro={erroDe('spot-mercadoria')}
              dica="Só para estimar o ad valorem. Não entra no total."
            >
              <NumberInput
                id="spot-mercadoria"
                valor={form.mercadoria}
                onValor={(v) => set('mercadoria', v)}
                casasFixas={2}
                prefixo="R$"
                placeholder="0,00"
              />
            </Field>

            <Field id="spot-obs" rotulo="Observações (opcional)" erro={erroDe('spot-obs')}>
              <Textarea
                id="spot-obs"
                value={form.obs}
                onChange={(e) => set('obs', e.target.value)}
                rows={3}
                placeholder="Aparecem no PDF e no texto copiado."
              />
            </Field>
          </fieldset>

          <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-t px-6 py-4">
            <Button
              type="submit"
              disabled={somenteLeitura || salvar.isPending}
              className="min-w-40"
            >
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {cotacao ? 'Salvar alterações' : 'Salvar cotação'}
              <kbd className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20 ml-1 hidden 2xl:inline-flex">
                Ctrl S
              </kbd>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <FileDown /> PDF <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => void pdf('cliente')}>
                  <FileDown /> PDF para o cliente
                  <span className="text-muted-foreground ml-auto text-xs">Ctrl P</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void pdf('operacao')}>
                  <FileDown /> PDF da operação (interno)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copiar()}
              title="Copiar texto (Ctrl+Shift+C)"
            >
              <Copy /> Copiar
            </Button>
            <Button type="button" variant="outline" onClick={email}>
              <Mail /> E-mail
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto"
              aria-label={cotacao ? 'Nova cotação' : 'Limpar'}
              title={cotacao ? 'Nova cotação' : 'Limpar'}
              disabled={vazio && !cotacao}
              onClick={() =>
                vazio || (cotacao && !alterado) ? limpar() : setConfirmarLimpar(true)
              }
            >
              <Eraser />
              <span className="hidden xl:inline 2xl:inline">
                {cotacao ? 'Nova cotação' : 'Limpar'}
              </span>
            </Button>
          </div>
        </form>

        <div className="lg:sticky lg:top-6">
          <PainelResultado
            form={form}
            resultado={resultado}
            cotacao={cotacao}
            alterado={alterado}
          />
        </div>
      </div>

      <CotacoesRecentes
        aberto={recentes}
        onAbertoChange={setRecentes}
        onAbrir={abrir}
        atualId={cotacao?.id}
      />
      <ConfirmDialog
        aberto={confirmarLimpar}
        onAbertoChange={setConfirmarLimpar}
        titulo={cotacao ? 'Descartar alterações?' : 'Limpar o formulário?'}
        descricao={
          cotacao
            ? 'As alterações não salvas desta cotação serão descartadas e o formulário ficará vazio.'
            : 'Todos os campos preenchidos serão apagados.'
        }
        confirmar={cotacao ? 'Descartar' : 'Limpar'}
        onConfirmar={limpar}
      />
    </Page>
  );
}
