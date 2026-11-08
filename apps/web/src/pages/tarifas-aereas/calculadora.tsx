import { formatBRL, formatNumero, parseNumero } from '@jat/core';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Calculator,
  Eraser,
  Hourglass,
  Package,
  SearchX,
  Send,
  Trophy,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Field } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { EmptyState, Segmentado } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Nivel, type OpcaoCotacaoAerea } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { enviarCustoAereoParaSpot, pesoTaxadoAereoDaCubagem } from '@/lib/integracoes';
import { useDebounce } from '@/lib/use-debounce';
import { useLocalStorage } from '@/lib/use-local-storage';
import { cn } from '@/lib/utils';
import { CiaBadge, NIVEIS, ROTULO_NIVEL, tarifaKg } from './comum';

interface Consulta {
  origem: string;
  destino: string;
  nivel: Nivel;
  peso: string;
}
const VAZIA: Consulta = { origem: '', destino: '', nivel: 'URGENTE', peso: '' };

function pesoValido(p: string) {
  try {
    const n = parseNumero(p);
    return n !== null && n.gt(0) ? n.toString() : null;
  } catch {
    return null;
  }
}

/** Calculadora rápida (CLAUDE.md §3.3): companhias da rota, do menor para o maior custo. */
export function CalculadoraRapida({ aeroportos }: { aeroportos: string[] }) {
  const { data: user } = useMe();
  const navigate = useNavigate();
  const [c, setC] = useLocalStorage<Consulta>(`jat-calc-tarifa:${user!.id}`, VAZIA);
  const set = <K extends keyof Consulta>(k: K, v: Consulta[K]) => setC((x) => ({ ...x, [k]: v }));
  const iata = (v: string) =>
    v
      .replace(/[^a-z]/gi, '')
      .toUpperCase()
      .slice(0, 3);

  const consulta = useDebounce(c, 250);
  const peso = pesoValido(consulta.peso);
  const pronta = consulta.origem.length === 3 && consulta.destino.length === 3 && !!peso;

  const q = useQuery({
    queryKey: ['air-rates', 'quote', consulta.origem, consulta.destino, consulta.nivel, peso],
    queryFn: async () =>
      (
        await api.get<{ options: OpcaoCotacaoAerea[] }>(
          `/api/air-rates/quote?origin=${consulta.origem}&destination=${consulta.destino}&level=${consulta.nivel}&weight=${peso}`,
        )
      ).options,
    enabled: pronta,
    placeholderData: (ant) => ant,
  });

  const pesoCubagem = useMemo(() => pesoTaxadoAereoDaCubagem(user!.id), [user]);

  const usarNoSpot = (o: OpcaoCotacaoAerea) => {
    enviarCustoAereoParaSpot(user!.id, o.value);
    toast.success(`Custo aéreo ${formatBRL(o.value)} (${o.airline}) enviado ao Frete Spot.`);
    void navigate('/spot');
  };

  const pesoTxt = peso ? `${formatNumero(peso, 2, 3)} kg` : '';

  return (
    <section
      aria-labelledby="calc-titulo"
      className="bg-card overflow-hidden rounded-2xl border shadow-sm"
    >
      <div className="from-primary/8 to-brand-accent/6 flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-br px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <Calculator className="size-4.5" />
          </span>
          <div>
            <h2 id="calc-titulo" className="font-semibold">
              Calculadora rápida
            </h2>
            <p className="text-muted-foreground text-xs">
              Tarifas ativas e vigentes hoje · peso usado como digitado
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setC(VAZIA)}
          disabled={JSON.stringify(c) === JSON.stringify(VAZIA)}
        >
          <Eraser /> Limpar
        </Button>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto_minmax(10rem,1fr)] md:items-start">
        <datalist id="lista-aeroportos">
          {aeroportos.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <Field id="calc-origem" rotulo="Origem">
          <Input
            id="calc-origem"
            list="lista-aeroportos"
            value={c.origem}
            onChange={(e) => set('origem', iata(e.target.value))}
            placeholder="GRU"
            className="font-mono tracking-widest uppercase"
            autoComplete="off"
          />
        </Field>
        <Field id="calc-destino" rotulo="Destino">
          <Input
            id="calc-destino"
            list="lista-aeroportos"
            value={c.destino}
            onChange={(e) => set('destino', iata(e.target.value))}
            placeholder="SSA"
            className="font-mono tracking-widest uppercase"
            autoComplete="off"
          />
        </Field>
        <div className="grid content-start gap-1.5">
          <span className="text-sm leading-none font-medium">Nível</span>
          <Segmentado
            rotulo="Nível de serviço"
            valor={c.nivel}
            onChange={(v) => set('nivel', v)}
            opcoes={NIVEIS.map((n) => ({ valor: n, rotulo: ROTULO_NIVEL[n] }))}
          />
        </div>
        <Field
          id="calc-peso"
          rotulo="Peso taxado"
          dica={
            pesoCubagem ? (
              <button
                type="button"
                className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                onClick={() => set('peso', pesoCubagem)}
              >
                <Package className="size-3" /> Usar peso da Cubagem ({pesoCubagem} kg)
              </button>
            ) : undefined
          }
        >
          <NumberInput
            id="calc-peso"
            valor={c.peso}
            onValor={(v) => set('peso', v)}
            casas={3}
            sufixo="kg"
            placeholder="0,00"
          />
        </Field>
      </div>

      <div className="border-t px-5 py-5" aria-live="polite">
        {!pronta ? (
          <EmptyState
            icone={Hourglass}
            titulo="Aguardando cálculo"
            descricao="Informe origem, destino, nível e peso taxado."
            className="py-8"
          />
        ) : q.isPending ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : q.isError ? (
          <p className="text-destructive text-sm">{q.error.message}</p>
        ) : q.data.length === 0 ? (
          <EmptyState
            icone={SearchX}
            titulo="Nenhuma tarifa vigente"
            descricao={`Não há tarifa ativa e vigente hoje para ${consulta.origem} → ${consulta.destino} no nível ${ROTULO_NIVEL[consulta.nivel]}.`}
            className="py-8"
          />
        ) : (
          <>
            <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-foreground font-mono font-semibold">{consulta.origem}</span>
              <ArrowRight className="text-brand-accent size-3.5" />
              <span className="text-foreground font-mono font-semibold">{consulta.destino}</span>
              <span>
                · {ROTULO_NIVEL[consulta.nivel]} · {pesoTxt}
              </span>
              <span className="ml-auto">
                {q.data.length} {q.data.length === 1 ? 'companhia' : 'companhias'}, do menor para o
                maior custo
              </span>
            </div>
            <ol className={cn('grid gap-3', q.data.length > 1 && 'sm:grid-cols-2 lg:grid-cols-3')}>
              <AnimatePresence initial={false}>
                {q.data.map((o, i) => (
                  <motion.li
                    key={o.airline}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, delay: i * 0.04 }}
                    className={cn(
                      'relative flex flex-col rounded-xl border p-4',
                      i === 0 ? 'border-primary/40 bg-primary/5 ring-primary/15 ring-2' : 'bg-card',
                    )}
                    data-testid="opcao-tarifa"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CiaBadge cia={o.airline} />
                      {i === 0 && (
                        <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          <Trophy className="size-3" /> Menor custo
                        </span>
                      )}
                    </div>
                    <div className="tabular mt-3 text-2xl font-bold tracking-tight">
                      {formatBRL(o.value)}
                    </div>
                    <div className="text-muted-foreground tabular mt-1 text-xs">
                      {o.minimumApplied ? (
                        <span className="text-status-declinada font-medium">
                          Mínimo aplicado (calculado {formatBRL(o.calculated)})
                        </span>
                      ) : (
                        <>
                          {tarifaKg(o.perKg)}/kg × {pesoTxt}
                        </>
                      )}
                      <span className="block">
                        Mínimo {formatBRL(o.min)} · tarifa v{o.version}
                      </span>
                    </div>
                    <Button
                      variant={i === 0 ? 'default' : 'outline'}
                      size="sm"
                      className="mt-4 self-start"
                      onClick={() => usarNoSpot(o)}
                    >
                      <Send /> Usar no Frete Spot
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
