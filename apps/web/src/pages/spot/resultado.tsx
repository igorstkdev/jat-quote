import {
  formatBRL,
  formatarCidade,
  formatPercentual,
  type Condicoes,
  type ResultadoSpot,
} from '@jat/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  EyeOff,
  Percent,
  Plane,
  Truck,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { LogoJatPrevia } from '@/components/logo';
import { StatusBadge } from '@/components/status-badge';
import { BlocoTermos } from '@/components/termos';
import type { Cotacao } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FormSpot } from './estado';

export function PainelResultado({
  form,
  resultado,
  cotacao,
  alterado,
  termos,
}: {
  form: FormSpot;
  resultado: ResultadoSpot | null;
  cotacao: Cotacao | null;
  alterado: boolean;
  /** Termos do modal (undefined = carregando). */
  termos: Condicoes | null | undefined;
}) {
  const obs = form.obs.trim();
  const [detalhe, setDetalhe] = useState(false);
  const temValor = !!resultado && (resultado.somaCustos.gt(0) || resultado.pedagio.gt(0));
  const IconeModal = form.modal === 'AEREO' ? Plane : Truck;

  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-sm" aria-live="polite">
      {/* Cabeçalho */}
      <div className="from-primary/8 to-brand-accent/6 border-b bg-gradient-to-br px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <Calculator className="size-4.5" />
            </span>
            <div>
              <div className="font-semibold">
                {cotacao ? `Cotação ${cotacao.code}` : 'Nova cotação'}
              </div>
              <div className="text-muted-foreground text-xs">
                {cotacao
                  ? alterado
                    ? 'Alterações não salvas'
                    : `Salva por ${cotacao.updatedBy?.name ?? cotacao.createdBy?.name ?? '—'}`
                  : 'Ainda não salva'}
              </div>
            </div>
          </div>
          <LogoJatPrevia />
        </div>
        <div className="mt-4 grid gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <User className="text-muted-foreground size-3.5" />
            <span className={cn(!form.cliente && 'text-muted-foreground')}>
              {form.cliente?.name ?? 'Cliente não selecionado'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className={cn(!form.origem && 'text-muted-foreground font-normal')}>
              {form.origem ? formatarCidade(form.origem) : 'Origem'}
            </span>
            <ArrowRight className="text-brand-accent size-4" />
            <span className={cn(!form.destino && 'text-muted-foreground font-normal')}>
              {form.destino ? formatarCidade(form.destino) : 'Destino'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs">
              <IconeModal className="text-primary size-3.5" />
              {form.modal === 'AEREO' ? 'Aéreo' : 'Rodoviário'}
            </span>
            {resultado && (
              <span className="bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs">
                <Percent className="text-success size-3.5" />
                Ad valorem {formatPercentual(resultado.adValorem.pct)}
              </span>
            )}
            {cotacao && <StatusBadge status={cotacao.status} />}
          </div>
        </div>
      </div>

      {!temValor ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="bg-muted text-muted-foreground mb-3 flex size-12 items-center justify-center rounded-xl">
            <Calculator className="size-5" />
          </div>
          <div className="font-medium">Aguardando cálculo</div>
          <p className="text-muted-foreground mt-1 text-sm">Preencha os custos para ver o valor.</p>
        </div>
      ) : (
        <div className="grid gap-4 p-6">
          <div className="text-center">
            <div className="text-muted-foreground text-sm">Total do frete</div>
            <motion.div
              key={resultado.total.toString()}
              initial={{ opacity: 0.4, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="text-primary tabular mt-1 text-4xl font-bold tracking-tight sm:text-5xl"
              data-testid="spot-total"
            >
              {formatBRL(resultado.total)}
            </motion.div>
          </div>

          <button
            type="button"
            onClick={() => setDetalhe((v) => !v)}
            className="hover:bg-accent flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors"
            aria-expanded={detalhe}
          >
            <ChevronDown className={cn('size-4 transition-transform', detalhe && 'rotate-180')} />
            Detalhar custos com MKUP
          </button>
          <AnimatePresence initial={false}>
            {detalhe && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid gap-2">
                  {resultado.componentes.map((c) => (
                    <div
                      key={c.componente}
                      className="bg-muted/40 rounded-lg border px-3 py-2.5 text-sm"
                    >
                      <div className="font-medium">
                        {c.rotulo.replace('Custo ', '').replace(/^de /, '')}
                      </div>
                      <div className="text-muted-foreground tabular mt-1 flex justify-between">
                        <span>Custo base</span>
                        <span>{formatBRL(c.custo)}</span>
                      </div>
                      <div className="text-muted-foreground tabular flex justify-between">
                        <span>
                          + MKUP ({formatPercentual(resultado.markupPct).replace(/,00%$/, '%')})
                        </span>
                        <span>{formatBRL(c.comMarkup.minus(c.custo))}</span>
                      </div>
                      <div className="tabular flex justify-between font-medium">
                        <span>Total com MKUP</span>
                        <span>{formatBRL(c.comMarkup)}</span>
                      </div>
                    </div>
                  ))}
                  {/* Valores internos (22/11/2026): só aparecem com o detalhamento aberto,
                      para a prévia poder ir em print para o cliente. */}
                  <Linha
                    rotulo="MKUP total aplicado"
                    valor={formatBRL(resultado.markupTotal)}
                    className="bg-destaque-mkup/10 text-destaque-mkup"
                    testid="spot-mkup"
                  />
                  <Linha
                    rotulo="Subtotal com MKUP"
                    valor={formatBRL(resultado.subtotal)}
                    className="bg-muted/60"
                    testid="spot-subtotal"
                  />
                  <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[11px]">
                    <EyeOff className="size-3" />
                    Uso interno: feche o detalhamento antes de enviar um print ao cliente.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Linha
            rotulo="Pedágio"
            valor={formatBRL(resultado.pedagio)}
            className="bg-destaque-pedagio/10 text-destaque-pedagio"
          />
          <div className="bg-total-final flex items-center justify-between rounded-xl px-5 py-4 text-white">
            <span className="font-semibold">Total final</span>
            <span className="tabular text-xl font-bold">{formatBRL(resultado.total)}</span>
          </div>

          <div className="text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs">
            {resultado.adValorem.condicao}
            {resultado.adValorem.estimativa && (
              <>
                {' '}
                Estimativa sobre {formatBRL(resultado.adValorem.valorMercadoria!)}:{' '}
                <strong className="text-foreground">
                  {formatBRL(resultado.adValorem.estimativa)}
                </strong>{' '}
                (não entra no total).
              </>
            )}
          </div>
        </div>
      )}

      {/* Termos e condições do modal e observações: letra menor, abaixo dos valores. */}
      {(termos !== null || obs) && (
        <div className="grid gap-4 border-t px-6 py-5">
          {termos === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <BlocoTermos condicoes={termos} />
          )}
          {obs && (
            <div
              className="border-nota-borda bg-nota rounded-lg border px-3 py-2.5"
              data-testid="previa-observacoes"
            >
              <div className="mb-0.5 text-nota-texto text-[11px] font-semibold tracking-wider uppercase">
                Observações
              </div>
              <p className="text-foreground/80 text-xs leading-relaxed whitespace-pre-wrap">
                {obs}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  className,
  testid,
}: {
  rotulo: string;
  valor: string;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium',
        className,
      )}
    >
      <span>{rotulo}</span>
      <span className="tabular text-base font-semibold" data-testid={testid}>
        {valor}
      </span>
    </div>
  );
}
