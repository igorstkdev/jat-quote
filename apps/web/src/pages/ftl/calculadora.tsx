import {
  calcularFtl,
  ErroValidacao,
  formatBRL,
  formatNumero,
  formatPercentual,
  linkEmailCotacaoFtl,
  textoCondicoes,
  textoCotacaoFtl,
  UFS,
  type Condicoes,
  type DadosTextoFtl,
  type ResultadoFtl,
} from '@jat/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Copy,
  Eraser,
  ExternalLink,
  FileDown,
  Loader2,
  Mail,
  MapPin,
  Save,
  Table2,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { EmptyState } from '@/components/page';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { BlocoTermos } from '@/components/termos';
import {
  api,
  ApiError,
  type Configuracoes,
  type Cotacao,
  type Localidade,
  type TabelaFtl,
  type VeiculoFtl,
} from '@/lib/api';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { kmBR, QUALP_URL, ROTULO_LOCALIDADE, ROTULO_VEICULO, VEICULOS } from './comum';

interface FormFtl {
  uf: string;
  localidade: Localidade;
  veiculo: VeiculoFtl;
  km: string;
  obs: string;
}
const VAZIO: FormFtl = { uf: '', localidade: 'CAPITAL', veiculo: 'VAN', km: '', obs: '' };

const chave = (u: string) => `jat-rascunho-ftl:${u}`;
function lerRascunho(u: string): { form: FormFtl; cotacao: Cotacao | null } | null {
  try {
    const b = localStorage.getItem(chave(u));
    if (!b) return null;
    const r = JSON.parse(b) as { form: FormFtl; cotacao: Cotacao | null };
    return { form: { ...VAZIO, ...r.form }, cotacao: r.cotacao ?? null };
  } catch {
    return null;
  }
}

const formDaCotacao = (q: Cotacao): FormFtl => ({
  uf: q.ftl?.uf ?? '',
  localidade: q.ftl?.locality ?? 'CAPITAL',
  veiculo: q.ftl?.vehicle ?? 'VAN',
  km: q.ftl?.distanceKm ? formatNumero(q.ftl.distanceKm, 0, 2) : '',
  obs: q.notes ?? '',
});

export function CalculadoraFtl() {
  const { data: user } = useMe();
  const userId = user!.id;
  const qc = useQueryClient();
  const [inicial] = useState(() => lerRascunho(userId));
  const [form, setForm] = useState<FormFtl>(inicial?.form ?? VAZIO);
  const [cotacao, setCotacao] = useState<Cotacao | null>(inicial?.cotacao ?? null);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);

  const tabelas = useQuery({
    queryKey: ['ftl-rates'],
    queryFn: async () => (await api.get<{ rates: TabelaFtl[] }>('/api/ftl/rates')).rates,
  });
  const cfg = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Configuracoes>('/api/settings'),
  });

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(chave(userId), JSON.stringify({ form, cotacao }));
      } catch {
        /* ignora */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form, cotacao, userId]);

  const ativas = useMemo(() => (tabelas.data ?? []).filter((t) => t.active), [tabelas.data]);
  const ufs = useMemo(() => [...new Set(ativas.map((t) => t.uf))].sort(), [ativas]);
  const tabela = ativas.find((t) => t.uf === form.uf && t.locality === form.localidade) ?? null;
  const temLocalidade = (l: Localidade) => ativas.some((t) => t.uf === form.uf && t.locality === l);

  const { resultado, erroKm } = useMemo((): {
    resultado: ResultadoFtl | null;
    erroKm: string | null;
  } => {
    if (!tabela || form.km === '') return { resultado: null, erroKm: null };
    try {
      return {
        resultado: calcularFtl({
          tarifa: {
            uf: tabela.uf,
            regiao: tabela.region,
            localidade: tabela.locality,
            tarifaKm: tabela.perKm,
            adValoremPct: tabela.adValoremPct,
          },
          veiculo: form.veiculo,
          distanciaKm: form.km,
        }),
        erroKm: null,
      };
    } catch (e) {
      if (e instanceof ErroValidacao) return { resultado: null, erroKm: e.message };
      throw e;
    }
  }, [tabela, form.km, form.veiculo]);

  const salva = cotacao ? formDaCotacao(cotacao) : null;
  const alterado = !!salva && JSON.stringify(salva) !== JSON.stringify(form);
  const vazio = JSON.stringify(form) === JSON.stringify(VAZIO);
  // Condições do veículo: as gravadas na cotação salva (sem alterações) ou as atuais.
  const condicoesAtuais: Condicoes | null =
    (cotacao && !alterado ? cotacao.terms : null) ?? cfg.data?.condicoesFtl[form.veiculo] ?? null;

  const set = <K extends keyof FormFtl>(k: K, v: FormFtl[K]) => setForm((f) => ({ ...f, [k]: v }));
  const escolherUf = (uf: string) => {
    const locs = ativas.filter((t) => t.uf === uf).map((t) => t.locality);
    setForm((f) => ({
      ...f,
      uf,
      localidade: locs.includes(f.localidade) ? f.localidade : (locs[0] ?? 'CAPITAL'),
    }));
  };

  const salvar = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ quote: Cotacao }>('/api/ftl/quotes', {
          uf: form.uf,
          locality: form.localidade,
          vehicle: form.veiculo,
          distanceKm: form.km,
          notes: form.obs,
        })
      ).quote,
    onSuccess: (q) => {
      setCotacao(q);
      setForm(formDaCotacao(q));
      void qc.invalidateQueries({ queryKey: ['ftl-quotes'] });
      toast.success(`Cotação ${q.code} salva.`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.campo === 'distanciaKm')
        document.getElementById('ftl-km')?.focus();
      toast.error(e.message);
    },
  });

  const limpar = () => {
    setForm(VAZIO);
    setCotacao(null);
    setConfirmarLimpar(false);
  };

  const dadosTexto = (): DadosTextoFtl | null => {
    if (!resultado || !tabela) {
      toast.error('Preencha UF, localidade, veículo e KM da rota primeiro.');
      return null;
    }
    return {
      numero: cotacao && !alterado ? cotacao.number : null,
      uf: tabela.uf,
      regiao: tabela.region,
      localidade: tabela.locality,
      veiculo: ROTULO_VEICULO[form.veiculo],
      distanciaKm: resultado.distanciaKm,
      tarifaKm: resultado.tarifaKm,
      total: resultado.total,
      adValoremPct: resultado.adValorem.pct,
      data: cotacao && !alterado ? new Date(cotacao.createdAt) : new Date(),
      condicoes: textoCondicoes(condicoesAtuais),
      observacoes: form.obs,
    };
  };

  const copiar = async () => {
    const d = dadosTexto();
    if (!d) return;
    try {
      await navigator.clipboard.writeText(textoCotacaoFtl(d, { whatsapp: true }));
      toast.success(
        d.numero
          ? 'Texto da cotação copiado.'
          : 'Texto copiado (cotação ainda não salva: sem número).',
      );
    } catch {
      toast.error('Não foi possível copiar. Verifique a permissão da área de transferência.');
    }
  };

  const email = () => {
    const d = dadosTexto();
    if (d) window.location.href = linkEmailCotacaoFtl(d);
  };

  const pdf = async () => {
    const janela = window.open('', '_blank');
    try {
      let q = cotacao;
      if (!q || alterado) q = await salvar.mutateAsync();
      const url = `/api/quotes/${q.id}/pdf`;
      if (janela) janela.location.href = url;
      else window.open(url, '_blank');
    } catch {
      janela?.close();
    }
  };

  if (tabelas.isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (ativas.length === 0) {
    return (
      <div className="bg-card rounded-2xl border">
        <EmptyState
          icone={Table2}
          titulo="Nenhuma tabela de preço ativa"
          descricao="A calculadora usa as tabelas por UF e tipo de localidade. Cadastre ou importe as tabelas primeiro."
          acao={
            <Button asChild>
              <Link to="/ftl/tabelas">
                <Table2 /> Ir para Tabelas de Preço
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
        noValidate
        className="bg-card rounded-2xl border shadow-sm"
      >
        <div className="grid gap-5 p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field id="ftl-uf" rotulo="UF de destino" obrigatorio>
              <Select value={form.uf} onValueChange={escolherUf}>
                <SelectTrigger id="ftl-uf" className="w-full">
                  <SelectValue placeholder="Escolha a UF" />
                </SelectTrigger>
                <SelectContent>
                  {ufs.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      <span className="font-mono font-semibold">{uf}</span>
                      <span className="text-muted-foreground">{UFS[uf as keyof typeof UFS]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid content-start gap-1.5">
              <span className="text-sm leading-none font-medium">Tipo de localidade</span>
              <div
                role="radiogroup"
                aria-label="Tipo de localidade"
                className="bg-muted inline-flex h-9 rounded-lg p-1"
              >
                {(['CAPITAL', 'INTERIOR'] as const).map((l) => {
                  const disp = !form.uf || temLocalidade(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={form.localidade === l}
                      disabled={!disp}
                      title={
                        disp
                          ? undefined
                          : `Sem tabela ativa para ${form.uf} ${ROTULO_LOCALIDADE[l]}`
                      }
                      onClick={() => set('localidade', l)}
                      className={cn(
                        'rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40',
                        form.localidade === l
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {ROTULO_LOCALIDADE[l]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm leading-none font-medium">Tipo de veículo</span>
            <div role="radiogroup" aria-label="Tipo de veículo" className="grid grid-cols-3 gap-2">
              {VEICULOS.map((v) => {
                const ativo = form.veiculo === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => set('veiculo', v)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-sm font-medium transition-all',
                      ativo
                        ? 'border-primary bg-primary/8 text-primary ring-primary/20 ring-2'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Truck className="size-4" />
                      {ROTULO_VEICULO[v]}
                    </span>
                    <span className="tabular text-xs font-normal opacity-80">
                      {tabela ? `${kmBR(tabela.perKm[v])}/km` : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            id="ftl-km"
            rotulo="KM da rota"
            obrigatorio
            erro={erroKm}
            dica={
              <a
                href={QUALP_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
              >
                <ExternalLink className="size-3" /> Consulte a quilometragem no Qualp
              </a>
            }
          >
            <NumberInput
              id="ftl-km"
              valor={form.km}
              onValor={(v) => set('km', v)}
              casas={2}
              sufixo="km"
              placeholder="Mínimo 25"
              aria-invalid={!!erroKm}
            />
          </Field>

          <Field id="ftl-obs" rotulo="Observações (opcional)">
            <Textarea
              id="ftl-obs"
              value={form.obs}
              onChange={(e) => set('obs', e.target.value)}
              rows={3}
              placeholder="Aparecem no PDF e no texto copiado."
            />
          </Field>
        </div>

        <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-t px-6 py-4">
          <Button type="submit" disabled={!resultado || salvar.isPending} className="min-w-40">
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {cotacao && alterado ? 'Salvar como nova' : 'Salvar cotação'}
          </Button>
          <Button type="button" variant="outline" onClick={() => void pdf()} disabled={!resultado}>
            <FileDown /> PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => void copiar()}>
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
            onClick={() => (vazio || (cotacao && !alterado) ? limpar() : setConfirmarLimpar(true))}
          >
            <Eraser />
            <span className="hidden 2xl:inline">{cotacao ? 'Nova cotação' : 'Limpar'}</span>
          </Button>
        </div>
      </form>

      <div className="lg:sticky lg:top-6">
        <PainelFtl
          form={form}
          tabela={tabela}
          resultado={resultado}
          cotacao={cotacao}
          alterado={alterado}
          condicoes={cfg.data ? condicoesAtuais : undefined}
        />
      </div>

      <ConfirmDialog
        aberto={confirmarLimpar}
        onAbertoChange={setConfirmarLimpar}
        titulo="Limpar o formulário?"
        descricao="Os dados preenchidos serão apagados."
        confirmar="Limpar"
        onConfirmar={limpar}
      />
    </div>
  );
}

function PainelFtl({
  form,
  tabela,
  resultado,
  cotacao,
  alterado,
  condicoes,
}: {
  form: FormFtl;
  tabela: TabelaFtl | null;
  resultado: ResultadoFtl | null;
  cotacao: Cotacao | null;
  alterado: boolean;
  condicoes: Condicoes | null | undefined;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-sm" aria-live="polite">
      <div className="from-primary/8 to-brand-accent/6 border-b bg-gradient-to-br px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <Truck className="size-4.5" />
            </span>
            <div>
              <div className="font-semibold">
                {cotacao && !alterado ? `Cotação ${cotacao.code}` : 'Nova cotação FTL'}
              </div>
              <div className="text-muted-foreground text-xs">
                {cotacao
                  ? alterado
                    ? `Alterada: ao salvar, vira uma nova cotação (a ${cotacao.code} fica como está)`
                    : `Salva por ${cotacao.createdBy?.name ?? '—'}`
                  : 'Ainda não salva'}
              </div>
            </div>
          </div>
          {cotacao && !alterado && <StatusBadge status={cotacao.status} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Chip icone={MapPin}>
            {form.uf ? `${form.uf} · ${ROTULO_LOCALIDADE[form.localidade]}` : 'UF de destino'}
          </Chip>
          <Chip icone={Truck}>{ROTULO_VEICULO[form.veiculo]}</Chip>
          {tabela && <Chip icone={Table2}>{`${tabela.region} · tabela v${tabela.version}`}</Chip>}
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Valor do frete
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={resultado?.total.toString() ?? 'vazio'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'text-primary tabular mt-1 text-4xl font-bold tracking-tight sm:text-5xl',
              !resultado && 'text-muted-foreground/50',
            )}
            data-testid="ftl-total"
          >
            {formatBRL(resultado?.total ?? 0)}
          </motion.div>
        </AnimatePresence>

        <dl className="mt-5 grid gap-2.5 text-sm">
          <Linha
            rotulo="Tarifa por KM"
            valor={resultado ? `${kmBR(resultado.tarifaKm.toString())}/km` : '—'}
          />
          <Linha
            rotulo="KM da rota"
            valor={resultado ? `${formatNumero(resultado.distanciaKm, 0, 2)} km` : '—'}
          />
          <Linha
            rotulo="Ad valorem (informativo)"
            valor={tabela ? `${formatPercentual(tabela.adValoremPct)} sobre a NF` : '—'}
          />
        </dl>
        <p className="text-muted-foreground mt-2 text-xs">
          Frete = KM da rota × tarifa por km do veículo. O ad valorem é cobrado à parte e não entra
          no total.
        </p>
      </div>

      <div className="bg-muted/30 border-t px-6 py-4">
        <div className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">
          Condições comerciais
        </div>
        {condicoes === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="max-h-48 overflow-y-auto">
            <BlocoTermos
              condicoes={condicoes}
              titulo=""
              vazio="Sem condições comerciais para este veículo."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ icone: Icone, children }: { icone: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="bg-background/70 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
      <Icone className="text-muted-foreground size-3.5" />
      {children}
    </span>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed pb-2.5 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular font-medium">{valor}</dd>
    </div>
  );
}
