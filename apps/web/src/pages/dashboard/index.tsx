import { formatBRL, formatNumero, rotuloMes, ROTULO_MODAL } from '@jat/core';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  HandCoins,
  Plane,
  Route,
  Target,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CotacaoVisaoSheet, IconeModal, type Visao } from '@/components/cotacao-visao';
import { EmptyState, Page, PageHeader, Segmentado } from '@/components/page';
import { PeriodoSelect, type ValorPeriodo } from '@/components/periodo-select';
import { ROTULO_STATUS, StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  api,
  type Cotacao,
  type DadosDashboard,
  type ModalCotacao,
  type StatusCotacao,
} from '@/lib/api';
import { formatDataHora } from '@/lib/format';
import { ehPeriodo, intervalo, type Periodo } from '@/lib/periodo';
import { cn } from '@/lib/utils';

type FiltroModal = 'todos' | ModalCotacao;
const MODAIS: ModalCotacao[] = ['AEREO', 'RODOVIARIO', 'FTL'];
const COR_MODAL: Record<ModalCotacao, string> = {
  AEREO: 'var(--modal-aereo)',
  RODOVIARIO: 'var(--modal-rodoviario)',
  FTL: 'var(--modal-ftl)',
};
const COR_STATUS: Record<StatusCotacao, string> = {
  PENDENTE: 'var(--status-pendente)',
  APROVADA: 'var(--status-aprovada)',
  DECLINADA: 'var(--status-declinada)',
  RECUSADA: 'var(--status-recusada)',
};

const compacto = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const brlCompacto = (v: number) => `R$ ${compacto.format(v)}`;
const inteiro = (n: number) => formatNumero(n, 0);

export default function DashboardPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const periodo: ValorPeriodo = {
    periodo: ehPeriodo(sp.get('periodo')) ? (sp.get('periodo') as Periodo) : '12m',
    de: sp.get('de') ?? '',
    ate: sp.get('ate') ?? '',
  };
  const m = sp.get('modal');
  const modal: FiltroModal = m === 'AEREO' || m === 'RODOVIARIO' || m === 'FTL' ? m : 'todos';
  const [visao, setVisao] = useState<{ q: Cotacao; v: Visao } | null>(null);

  const mudar = (novo: Record<string, string | null>) =>
    setSp(
      (atual) => {
        const n = new URLSearchParams(atual);
        for (const [k, v] of Object.entries(novo)) {
          if (v) n.set(k, v);
          else n.delete(k);
        }
        return n;
      },
      { replace: true },
    );

  const { from, to } =
    periodo.periodo === 'personalizado'
      ? { from: periodo.de, to: periodo.ate }
      : intervalo(periodo.periodo);
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (modal !== 'todos') qs.set('modal', modal);

  const dash = useQuery({
    queryKey: ['dashboard', qs.toString()],
    queryFn: () => api.get<DadosDashboard>(`/api/dashboard?${qs.toString()}`),
    placeholderData: (a) => a,
  });
  const d = dash.data;

  const abrirCotacao = async (id: string) => {
    const { quote } = await api.get<{ quote: Cotacao }>(`/api/quotes/${id}`);
    setVisao({ q: quote, v: 'cliente' });
  };

  return (
    <Page className="max-w-[90rem]">
      <PageHeader
        titulo="Dashboard"
        descricao="Cotações Spot e FTL: volume, valores, conversão e principais rotas."
        acoes={
          <>
            <PeriodoSelect
              id="dash-periodo"
              valor={periodo}
              onChange={(p) =>
                mudar({
                  periodo: p.periodo === '12m' ? null : p.periodo,
                  de: p.periodo === 'personalizado' ? p.de : null,
                  ate: p.periodo === 'personalizado' ? p.ate : null,
                })
              }
            />
            <Segmentado
              rotulo="Modal"
              valor={modal}
              onChange={(v) => mudar({ modal: v === 'todos' ? null : v })}
              opcoes={[
                { valor: 'todos', rotulo: 'Todos' },
                { valor: 'AEREO', rotulo: 'Aéreo' },
                { valor: 'RODOVIARIO', rotulo: 'Rodoviário' },
                { valor: 'FTL', rotulo: 'FTL' },
              ]}
            />
          </>
        }
      />

      <div className={cn('grid gap-4 transition-opacity', dash.isPlaceholderData && 'opacity-60')}>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi
            icone={FileText}
            rotulo="Cotações"
            valor={d && inteiro(d.kpis.total)}
            detalhe="no período"
          />
          <Kpi
            icone={CalendarCheck}
            rotulo="Cotações hoje"
            valor={d && inteiro(d.kpis.today)}
            detalhe={d ? `${d.period.today.split('-').reverse().join('/')}` : undefined}
          />
          <Kpi
            icone={CheckCircle2}
            rotulo="Aprovadas"
            valor={d && inteiro(d.kpis.approved)}
            detalhe={d ? `${inteiro(d.kpis.declined)} declinadas` : undefined}
            cor="text-status-aprovada"
          />
          <Kpi
            icone={CircleDollarSign}
            rotulo="Valor cotado"
            valor={d && formatBRL(d.kpis.quotedValue)}
            detalhe="todas as cotações"
          />
          <Kpi
            icone={HandCoins}
            rotulo="Valor aprovado"
            valor={d && formatBRL(d.kpis.approvedValue)}
            detalhe="cotações aprovadas"
            cor="text-status-aprovada"
          />
          <Kpi
            icone={Target}
            rotulo="Conversão"
            valor={
              d &&
              (d.kpis.conversionPct === null ? '—' : `${formatNumero(d.kpis.conversionPct, 1)}%`)
            }
            detalhe="aprovadas ÷ (aprovadas + declinadas)"
            destaque
          />
        </div>

        {/* Volume mensal + status */}
        <div className="grid gap-4 lg:grid-cols-3">
          <VolumeMensal dados={d} modal={modal} className="lg:col-span-2" />
          <DistribuicaoStatus
            dados={d}
            onStatus={(s) =>
              navigate(
                `/relatorios?status=${s}${modal === 'AEREO' || modal === 'RODOVIARIO' ? `&modal=${modal}` : ''}`,
              )
            }
            podeAbrirRelatorio={modal !== 'FTL'}
          />
        </div>

        {/* Rotas + atalhos + atividade */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <TopRotas dados={d} className="lg:col-span-2" />
          <div className="grid content-start gap-4">
            <Atalhos />
            <AtividadeRecente dados={d} onAbrir={(id) => void abrirCotacao(id)} />
          </div>
        </div>
      </div>

      <CotacaoVisaoSheet
        cotacao={visao?.q ?? null}
        visao={visao?.v ?? 'cliente'}
        onVisaoChange={(v) => setVisao((a) => (a ? { ...a, v } : a))}
        onFechar={() => setVisao(null)}
        acoes={(q) =>
          q.modal !== 'FTL' && (
            <Link
              to={`/relatorios?q=${q.code}`}
              className="text-primary ml-auto inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Ver no relatório <ArrowRight className="size-3.5" />
            </Link>
          )
        }
      />
    </Page>
  );
}

// ───────────────────────── Peças ─────────────────────────

function Card({
  titulo,
  icone: Icone,
  acao,
  children,
  className,
}: {
  titulo: string;
  icone: LucideIcon;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('bg-card flex flex-col rounded-xl border shadow-xs', className)}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icone className="text-muted-foreground size-4" />
          {titulo}
        </h2>
        {acao}
      </header>
      <div className="flex flex-1 flex-col px-5 pb-5">{children}</div>
    </section>
  );
}

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  cor,
  destaque,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string | undefined;
  detalhe?: string;
  cor?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card relative overflow-hidden rounded-xl border px-4 py-3.5 shadow-xs',
        destaque && 'from-primary/10 to-brand-accent/8 border-primary/25 bg-gradient-to-br',
      )}
      data-testid={`kpi-${rotulo}`}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icone className={cn('size-3.5', cor ?? (destaque ? 'text-primary' : ''))} />
        {rotulo}
      </div>
      {valor === undefined ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <motion.div
          key={valor}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className={cn(
            'tabular mt-1 truncate text-2xl font-semibold tracking-tight',
            destaque && 'text-primary',
          )}
          data-testid="kpi-valor"
        >
          {valor}
        </motion.div>
      )}
      {detalhe && (
        <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs" title={detalhe}>
          {detalhe}
        </div>
      )}
    </div>
  );
}

function DicaGrafico({
  active,
  payload,
  label,
  valor,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string; name?: string }[];
  label?: string;
  valor: boolean;
}) {
  if (!active || !payload?.length) return null;
  const itens = payload.filter((p) => (p.value ?? 0) > 0);
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-popover text-popover-foreground min-w-44 rounded-lg border px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-semibold">{label}</div>
      {itens.length === 0 && <div className="text-muted-foreground">Sem cotações</div>}
      {itens.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium">
            {valor ? formatBRL(p.value ?? 0) : inteiro(p.value ?? 0)}
          </span>
        </div>
      ))}
      {itens.length > 1 && (
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular">{valor ? formatBRL(total) : inteiro(total)}</span>
        </div>
      )}
    </div>
  );
}

function VolumeMensal({
  dados,
  modal,
  className,
}: {
  dados: DadosDashboard | undefined;
  modal: FiltroModal;
  className?: string;
}) {
  const [medida, setMedida] = useState<'qtd' | 'valor'>('qtd');
  const series = modal === 'todos' ? MODAIS : [modal];
  const pontos = (dados?.monthly ?? []).map((p) => {
    const o: Record<string, string | number> = { mes: rotuloMes(p.month) };
    let total = 0;
    for (const m of MODAIS) {
      const v = medida === 'qtd' ? p[m] : Number(p[`${m}_value`]);
      o[m] = v;
      if (series.includes(m)) total += v;
    }
    // Rótulo do total do mês só no segmento mais alto que tem valor (o de cima da pilha).
    const topo = [...series].reverse().find((m) => Number(o[m]) > 0);
    for (const m of series) o[`rotulo_${m}`] = m === topo ? total : 0;
    return o;
  });
  const vazio = !!dados && dados.kpis.total === 0;

  return (
    <Card
      titulo="Volume mensal"
      icone={BarChart3}
      className={className}
      acao={
        <Segmentado
          rotulo="Medida do gráfico"
          valor={medida}
          onChange={setMedida}
          opcoes={[
            { valor: 'qtd', rotulo: 'Quantidade' },
            { valor: 'valor', rotulo: 'Valor' },
          ]}
        />
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((m) => (
          <span key={m} className="text-muted-foreground inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COR_MODAL[m] }} />
            {ROTULO_MODAL[m]}
          </span>
        ))}
      </div>
      {!dados ? (
        <Skeleton className="h-64 w-full" />
      ) : vazio ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem cotações no período"
          descricao="Mude o período ou o modal."
          className="h-64 py-0"
        />
      ) : (
        <div className="min-h-64 flex-1" data-testid="grafico-mensal">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pontos} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={medida === 'valor' ? 64 : 32}
                allowDecimals={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(v: number) => (medida === 'valor' ? brlCompacto(v) : inteiro(v))}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={<DicaGrafico valor={medida === 'valor'} />}
              />
              {series.map((m, i) => (
                <Bar
                  key={m}
                  dataKey={m}
                  name={ROTULO_MODAL[m]}
                  stackId="v"
                  fill={COR_MODAL[m]}
                  maxBarSize={44}
                  animationDuration={500}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                >
                  {/* Rótulo de dados (22/11/2026): total do mês em cima da pilha, desenhado
                      pelo segmento mais alto que tem valor naquele mês. */}
                  <LabelList
                    dataKey={`rotulo_${m}`}
                    position="top"
                    offset={6}
                    fill="var(--foreground)"
                    fontSize={11}
                    fontWeight={600}
                    formatter={(v: unknown) => {
                      const n = Number(v);
                      if (!n) return '';
                      return medida === 'valor' ? compacto.format(n) : inteiro(n);
                    }}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function DistribuicaoStatus({
  dados,
  onStatus,
  podeAbrirRelatorio,
}: {
  dados: DadosDashboard | undefined;
  onStatus: (s: StatusCotacao) => void;
  podeAbrirRelatorio: boolean;
}) {
  const fatias = (dados?.byStatus ?? []).map((s) => ({ ...s, nome: ROTULO_STATUS[s.status] }));
  const total = dados?.kpis.total ?? 0;
  const maiorValor = Math.max(1, ...fatias.map((f) => Number(f.value)));

  return (
    <Card titulo="Distribuição por status" icone={Activity}>
      {!dados ? (
        <Skeleton className="h-64 w-full" />
      ) : total === 0 ? (
        <EmptyState icone={Activity} titulo="Sem cotações no período" className="h-64 py-0" />
      ) : (
        <div className="grid gap-4">
          <div className="relative mx-auto size-36" data-testid="grafico-status">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fatias.filter((f) => f.count > 0)}
                  dataKey="count"
                  nameKey="nome"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  animationDuration={500}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {fatias
                    .filter((f) => f.count > 0)
                    .map((f) => (
                      <Cell key={f.status} fill={COR_STATUS[f.status]} />
                    ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-2xl font-semibold">{inteiro(total)}</span>
              <span className="text-muted-foreground text-xs">cotações</span>
            </div>
          </div>
          <ul className="grid gap-2.5">
            {fatias.map((f) => {
              const pct = total ? (f.count / total) * 100 : 0;
              const conteudo = (
                <>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: COR_STATUS[f.status] }}
                      />
                      {f.nome}
                      <span className="text-muted-foreground tabular text-xs">
                        {inteiro(f.count)} · {formatNumero(pct, 0, 1)}%
                      </span>
                    </span>
                    <span className="tabular font-medium">{formatBRL(f.value)}</span>
                  </div>
                  <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: COR_STATUS[f.status] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(Number(f.value) / maiorValor) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </>
              );
              return (
                <li key={f.status}>
                  {podeAbrirRelatorio ? (
                    <button
                      type="button"
                      onClick={() => onStatus(f.status)}
                      className="hover:bg-accent/50 -mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left"
                      title={`Ver cotações ${f.nome.toLowerCase()}s no relatório`}
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <div className="py-1">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">Barras: valor cotado em cada status.</p>
        </div>
      )}
    </Card>
  );
}

function TopRotas({ dados, className }: { dados: DadosDashboard | undefined; className?: string }) {
  const rotas = dados?.topRoutes ?? [];
  const maior = Math.max(1, ...rotas.map((r) => r.count));
  return (
    <Card titulo="Top 10 rotas" icone={Route} className={className}>
      {!dados ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rotas.length === 0 ? (
        <EmptyState icone={Route} titulo="Sem rotas no período" className="py-10" />
      ) : (
        <ol className="grid gap-1" data-testid="top-rotas">
          <li className="text-muted-foreground grid grid-cols-[1.5rem_minmax(0,1fr)_4rem_7.5rem] gap-3 px-2 pb-1 text-xs font-medium">
            <span>#</span>
            <span>Rota</span>
            <span className="text-right">Cotações</span>
            <span className="text-right">Valor</span>
          </li>
          {rotas.map((r, i) => (
            <li
              key={r.route}
              className="hover:bg-accent/40 relative grid grid-cols-[1.5rem_minmax(0,1fr)_4rem_7.5rem] items-center gap-3 rounded-md px-2 py-2 text-sm"
            >
              <span className="text-muted-foreground tabular text-xs">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-medium" title={r.route}>
                  {r.ftl && <Warehouse className="text-modal-ftl size-3.5 shrink-0" />}
                  <span className="truncate">{r.route}</span>
                </div>
                <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
                  <motion.div
                    className={cn('h-full rounded-full', r.ftl ? 'bg-modal-ftl' : 'bg-primary')}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.count / maior) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.03, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <span className="tabular text-right font-semibold">{inteiro(r.count)}</span>
              <span className="tabular text-muted-foreground text-right whitespace-nowrap">
                {formatBRL(r.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const ATALHOS: { to: string; rotulo: string; icone: LucideIcon }[] = [
  { to: '/spot', rotulo: 'Frete Spot', icone: Calculator },
  { to: '/cubagem', rotulo: 'Cubagem', icone: Boxes },
  { to: '/tarifas-aereas', rotulo: 'Tarifas aéreas', icone: Plane },
  { to: '/ftl', rotulo: 'FTL Fiat', icone: Warehouse },
  { to: '/relatorios', rotulo: 'Relatório Spot', icone: FileText },
  { to: '/ftl/relatorio', rotulo: 'Relatório FTL', icone: BarChart3 },
];

function Atalhos() {
  return (
    <Card titulo="Atalhos" icone={ArrowRight}>
      <div className="grid grid-cols-2 gap-2">
        {ATALHOS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="hover:border-primary/40 hover:bg-accent/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            <a.icone className="text-primary size-4 shrink-0" />
            <span className="truncate">{a.rotulo}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AtividadeRecente({
  dados,
  onAbrir,
}: {
  dados: DadosDashboard | undefined;
  onAbrir: (id: string) => void;
}) {
  return (
    <Card titulo="Atividade recente" icone={Activity}>
      {!dados ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : dados.recent.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma atividade ainda.</p>
      ) : (
        <ul className="-mx-2 grid" data-testid="atividade-recente">
          {dados.recent.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onAbrir(e.quote.id)}
                className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left"
              >
                <span className="bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
                  <IconeModal modal={e.quote.modal} className="text-muted-foreground size-3.5" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="text-primary tabular font-semibold">{e.quote.code}</span>{' '}
                      <span className="text-muted-foreground">
                        {e.from === null ? 'criada' : 'mudou para'}
                      </span>
                    </span>
                    {e.from !== null && <StatusBadge status={e.to} className="shrink-0" />}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {e.quote.client ?? e.quote.route} · {formatBRL(e.quote.total)}
                  </div>
                  <div className="text-muted-foreground/80 text-xs">
                    {e.user} · {formatDataHora(e.at)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
