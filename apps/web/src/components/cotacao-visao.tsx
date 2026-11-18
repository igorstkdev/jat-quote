import {
  calcularSpot,
  dataValidade,
  formatBRL,
  formatNumero,
  formatPercentual,
  ROTULO_MODAL,
  textoCondicaoAdValorem,
  VALIDADE_COTACAO_DIAS,
} from '@jat/core';
import { ArrowRight, Building2, Eye, FileDown, Lock, Plane, Truck, Warehouse } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { BlocoTermos, termosDaCotacao } from '@/components/termos';
import { api, type Configuracoes, type Cotacao } from '@/lib/api';
import { formatData, formatDataHora } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROTULO_LOCALIDADE, ROTULO_VEICULO } from '@/pages/ftl/comum';

export type Visao = 'cliente' | 'operacao';

export const IconeModal = ({
  modal,
  className,
}: {
  modal: Cotacao['modal'];
  className?: string;
}) => {
  const Icone = modal === 'AEREO' ? Plane : modal === 'FTL' ? Warehouse : Truck;
  return <Icone className={className} />;
};

/** Rota da cotação em texto: "Cidade, UF → Cidade, UF" ou, no FTL, "Tabela FTL: UF Capital". */
export function rotaDaCotacao(q: Cotacao): string {
  if (q.modal === 'FTL') {
    const f = q.ftl;
    return `Tabela FTL: ${f?.uf ?? ''} ${f?.locality ? ROTULO_LOCALIDADE[f.locality] : ''}`.trim();
  }
  return `${q.origin ?? '—'} → ${q.dest ?? '—'}`;
}

/**
 * Painel lateral com as duas visões da cotação (CLAUDE.md §3.6):
 * Cliente (sem custos internos) e Operação (todos os componentes com MKUP).
 */
export function CotacaoVisaoSheet({
  cotacao,
  visao,
  onVisaoChange,
  onFechar,
  acoes,
}: {
  cotacao: Cotacao | null;
  visao: Visao;
  onVisaoChange: (v: Visao) => void;
  onFechar: () => void;
  acoes?: (q: Cotacao) => ReactNode;
}) {
  return (
    <Sheet open={!!cotacao} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {cotacao && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex items-center justify-between gap-3 pr-8">
                <SheetTitle className="tabular">Cotação {cotacao.code}</SheetTitle>
                <StatusBadge status={cotacao.status} />
              </div>
              <SheetDescription>
                {formatDataHora(cotacao.createdAt)} · criada por {cotacao.createdBy?.name ?? '—'}
                {cotacao.updatedBy && cotacao.updatedAt !== cotacao.createdAt && (
                  <> · alterada por {cotacao.updatedBy.name}</>
                )}
              </SheetDescription>
            </SheetHeader>
            <Tabs
              value={visao}
              onValueChange={(v) => onVisaoChange(v as Visao)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-b px-5 py-3">
                <TabsList className="w-full">
                  <TabsTrigger value="cliente">
                    <Eye /> Visão cliente
                  </TabsTrigger>
                  <TabsTrigger value="operacao">
                    <Lock /> Visão operação
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <TabsContent value="cliente">
                  <VisaoCliente q={cotacao} />
                </TabsContent>
                <TabsContent value="operacao">
                  {cotacao.modal === 'FTL' ? (
                    <VisaoOperacaoFtl q={cotacao} />
                  ) : (
                    <VisaoOperacaoSpot q={cotacao} />
                  )}
                </TabsContent>
              </div>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2 border-t p-4">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/quotes/${cotacao.id}/pdf?visao=${visao}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileDown /> PDF {visao === 'cliente' ? 'do cliente' : 'da operação'}
                </a>
              </Button>
              {acoes?.(cotacao)}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Cabecalho({ q }: { q: Cotacao }) {
  return (
    <div className="grid gap-2 text-sm">
      {q.modal !== 'FTL' && (
        <div className="flex items-center gap-2">
          <Building2 className="text-muted-foreground size-4" />
          <span className="font-medium">{q.clientName}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 font-medium">
        {q.modal === 'FTL' ? (
          rotaDaCotacao(q)
        ) : (
          <>
            {q.origin}
            <ArrowRight className="text-brand-accent size-4" />
            {q.dest}
          </>
        )}
      </div>
      <div>
        <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs">
          <IconeModal modal={q.modal} className="text-primary size-3.5" />
          {ROTULO_MODAL[q.modal]}
        </span>
      </div>
    </div>
  );
}

function VisaoCliente({ q }: { q: Cotacao }) {
  return (
    <div className="grid gap-5" data-testid="visao-cliente">
      <Cabecalho q={q} />
      <div className="from-primary/8 to-brand-accent/6 rounded-xl border bg-gradient-to-br px-5 py-4 text-center">
        <div className="text-muted-foreground text-sm">Valor do frete</div>
        <div className="text-primary tabular mt-1 text-3xl font-bold tracking-tight">
          {formatBRL(q.total)}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Item rotulo="Data">{formatData(q.createdAt)}</Item>
        {q.modal === 'FTL' ? (
          <Item rotulo="Veículo">{q.ftl?.vehicle ? ROTULO_VEICULO[q.ftl.vehicle] : '—'}</Item>
        ) : (
          <Item rotulo="Validade">
            {formatData(dataValidade(new Date(q.createdAt)))} ({VALIDADE_COTACAO_DIAS} dias)
          </Item>
        )}
      </dl>
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs">
        {textoCondicaoAdValorem(q.adValoremPct)}
      </p>
      <TermosVisao q={q} />
      {q.notes && (
        <div className="text-sm">
          <div className="text-muted-foreground mb-1 text-xs font-medium">Observações</div>
          <p className="whitespace-pre-line">{q.notes}</p>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Esta é a visão que vai para o cliente: sem custos internos.
      </p>
    </div>
  );
}

function VisaoOperacaoSpot({ q }: { q: Cotacao }) {
  const r = calcularSpot({
    modal: q.modal === 'AEREO' ? 'AEREO' : 'RODOVIARIO',
    custos: q.costs,
    pedagio: q.toll,
    markupPct: q.markupPct,
    adValoremPct: q.adValoremPct,
    valorMercadoria: q.goodsValue,
  });
  const mk = formatPercentual(r.markupPct).replace(/,00%$/, '%');
  return (
    <div className="grid gap-4" data-testid="visao-operacao">
      <Cabecalho q={q} />
      <div className="grid gap-2">
        <div className="text-muted-foreground text-xs font-medium">
          Detalhamento dos custos (MKUP individual)
        </div>
        {r.componentes.map((c) => (
          <div key={c.componente} className="bg-muted/40 rounded-lg border px-3 py-2.5 text-sm">
            <div className="font-medium">{c.rotulo}</div>
            <Linha rotulo="Custo base" valor={formatBRL(c.custo)} suave />
            <Linha rotulo={`+ MKUP (${mk})`} valor={formatBRL(c.comMarkup.minus(c.custo))} suave />
            <Linha rotulo="Total com MKUP" valor={formatBRL(c.comMarkup)} />
          </div>
        ))}
      </div>
      <div className="grid gap-1.5 rounded-xl border px-4 py-3 text-sm">
        <Linha rotulo="Soma dos custos" valor={formatBRL(q.costTotal)} suave />
        <Linha rotulo="MKUP total aplicado" valor={formatBRL(q.markupTotal)} />
        <Linha rotulo="Subtotal com MKUP" valor={formatBRL(q.subtotal)} />
        <Linha rotulo="Pedágio" valor={formatBRL(q.toll)} />
        <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
          <span>Total do frete</span>
          <span className="tabular text-primary text-lg">{formatBRL(q.total)}</span>
        </div>
      </div>
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs">
        Ad valorem {formatPercentual(q.adValoremPct)} (informativo, fora do total).
        {r.adValorem.estimativa && (
          <>
            {' '}
            Estimativa sobre {formatBRL(r.adValorem.valorMercadoria!)}:{' '}
            {formatBRL(r.adValorem.estimativa)}.
          </>
        )}
      </p>
      <TermosVisao q={q} />
      {q.notes && (
        <div className="text-sm">
          <div className="text-muted-foreground mb-1 text-xs font-medium">Observações</div>
          <p className="whitespace-pre-line">{q.notes}</p>
        </div>
      )}
    </div>
  );
}

function VisaoOperacaoFtl({ q }: { q: Cotacao }) {
  const f = q.ftl;
  return (
    <div className="grid gap-4" data-testid="visao-operacao">
      <Cabecalho q={q} />
      <div className="grid gap-1.5 rounded-xl border px-4 py-3 text-sm">
        <Linha rotulo="Região" valor={f?.region || '—'} suave />
        <Linha rotulo="Veículo" valor={f?.vehicle ? ROTULO_VEICULO[f.vehicle] : '—'} suave />
        <Linha rotulo="KM da rota" valor={`${formatNumero(f?.distanceKm ?? '0', 0, 2)} km`} suave />
        <Linha
          rotulo={`Tarifa por km${f?.rateVersion ? ` (tabela v${f.rateVersion})` : ''}`}
          valor={formatBRL(f?.ratePerKm ?? '0')}
          suave
        />
        <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
          <span>Valor do frete</span>
          <span className="tabular text-primary text-lg">{formatBRL(q.total)}</span>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Ad valorem {formatPercentual(q.adValoremPct)} (informativo). FTL sem pedágio e sem markup.
      </p>
    </div>
  );
}

function Linha({ rotulo, valor, suave }: { rotulo: string; valor: string; suave?: boolean }) {
  return (
    <div
      className={cn(
        'tabular flex justify-between gap-3',
        suave ? 'text-muted-foreground' : 'font-medium',
      )}
    >
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-lg border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="tabular mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** Termos e condições gravados na cotação (ou os atuais, nas cotações antigas). */
function TermosVisao({ q }: { q: Cotacao }) {
  const cfg = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Configuracoes>('/api/settings'),
    enabled: !q.terms,
  });
  return (
    <BlocoTermos
      condicoes={termosDaCotacao(q, cfg.data)}
      titulo={q.modal === 'FTL' ? 'Condições comerciais' : 'Termos e condições'}
    />
  );
}
