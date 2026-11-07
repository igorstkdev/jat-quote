import {
  calcularCubagem,
  ErroValidacao,
  FATOR_CUBAGEM,
  formatNumero,
  formatPeso,
  type ResultadoCubagem,
} from '@jat/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box,
  Copy,
  CopyPlus,
  Eraser,
  Info,
  Package,
  Plane,
  Plus,
  Scale,
  Trash2,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';

type Modal = 'AEREO' | 'RODOVIARIO';

interface Linha {
  id: string;
  c: string;
  l: string;
  a: string;
  peso: string;
  qtd: string;
}

interface Estado {
  modal: Modal;
  linhas: Linha[];
}

const novaLinha = (): Linha => ({
  id: crypto.randomUUID(),
  c: '',
  l: '',
  a: '',
  peso: '',
  qtd: '1',
});
const VAZIO = (): Estado => ({ modal: 'RODOVIARIO', linhas: [novaLinha()] });
const chave = (u: string) => `jat-rascunho-cubagem:${u}`;

function lerRascunho(u: string): Estado | null {
  try {
    const b = localStorage.getItem(chave(u));
    if (!b) return null;
    const e = JSON.parse(b) as Estado;
    return e.linhas?.length ? e : null;
  } catch {
    return null;
  }
}

const completa = (l: Linha) => l.c !== '' && l.l !== '' && l.a !== '';
const tocada = (l: Linha) => l.c !== '' || l.l !== '' || l.a !== '' || l.peso !== '';

interface Calc {
  resultado: ResultadoCubagem | null;
  /** índice da linha original → resultado */
  porLinha: Map<number, ResultadoCubagem['volumes'][number]>;
  erro: { linha: number; campo: string; mensagem: string } | null;
}

function calcular(e: Estado): Calc {
  const usadas = e.linhas.map((l, i) => ({ l, i })).filter(({ l }) => completa(l));
  if (usadas.length === 0) return { resultado: null, porLinha: new Map(), erro: null };
  try {
    const r = calcularCubagem({
      modal: e.modal,
      volumes: usadas.map(({ l }) => ({
        comprimentoM: l.c,
        larguraM: l.l,
        alturaM: l.a,
        pesoBrutoKg: l.peso,
        quantidade: l.qtd,
      })),
    });
    const porLinha = new Map(usadas.map(({ i }, k) => [i, r.volumes[k]!]));
    return { resultado: r, porLinha, erro: null };
  } catch (err) {
    if (!(err instanceof ErroValidacao)) throw err;
    const m = /^volumes\.(\d+)\.(\w+)$/.exec(err.campo);
    const k = m ? Number(m[1]) : 0;
    const linha = usadas[k]?.i ?? 0;
    return {
      resultado: null,
      porLinha: new Map(),
      erro: {
        linha,
        campo: m?.[2] ?? '',
        mensagem: err.message.replace(/^Volume \d+: /, ''),
      },
    };
  }
}

export default function CubagemPage() {
  const { data: user } = useMe();
  const userId = user!.id;
  const [estado, setEstado] = useState<Estado>(() => lerRascunho(userId) ?? VAZIO());
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(chave(userId), JSON.stringify(estado));
      } catch {
        /* ignora */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [estado, userId]);

  const calc = useMemo(() => calcular(estado), [estado]);
  const r = calc.resultado;

  const setLinha = (id: string, k: keyof Linha, v: string) =>
    setEstado((e) => ({ ...e, linhas: e.linhas.map((l) => (l.id === id ? { ...l, [k]: v } : l)) }));
  const adicionar = () => setEstado((e) => ({ ...e, linhas: [...e.linhas, novaLinha()] }));
  const duplicar = (id: string) =>
    setEstado((e) => {
      const i = e.linhas.findIndex((l) => l.id === id);
      const copia = { ...e.linhas[i]!, id: crypto.randomUUID() };
      return { ...e, linhas: [...e.linhas.slice(0, i + 1), copia, ...e.linhas.slice(i + 1)] };
    });
  const remover = (id: string) =>
    setEstado((e) => ({
      ...e,
      linhas: e.linhas.length > 1 ? e.linhas.filter((l) => l.id !== id) : [novaLinha()],
    }));
  const limpar = () => {
    setEstado(VAZIO());
    setConfirmar(false);
  };

  const copiar = async () => {
    if (!r) return toast.error('Preencha as medidas de pelo menos um volume.');
    const linhas = estado.linhas
      .map((l, i) => ({ l, v: calc.porLinha.get(i) }))
      .filter((x) => x.v)
      .map(
        ({ l, v }) =>
          `Volume ${v!.indice}: ${l.c} × ${l.l} × ${l.a} m · ${v!.quantidade} un · bruto ${formatPeso(v!.pesoBruto)} · cubado ${formatPeso(v!.pesoCubado)}`,
      );
    const texto = [
      `CUBAGEM — ${estado.modal === 'AEREO' ? 'Aéreo' : 'Rodoviário'} (fator ${formatNumero(FATOR_CUBAGEM[estado.modal], 0, 3)} kg/m³)`,
      ...linhas,
      '',
      `Peso bruto total: ${formatPeso(r.pesoBrutoTotal)}`,
      `Peso cubado total: ${formatPeso(r.pesoCubadoTotal)}`,
      `Peso taxado total: ${formatPeso(r.pesoTaxadoTotal)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Resumo da cubagem copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const vazio = estado.linhas.every((l) => !tocada(l));

  return (
    <Page>
      <PageHeader
        titulo="Cubagem"
        descricao="Medidas em metros e peso em kg. O peso taxado total é o maior entre a soma dos pesos brutos e a soma dos cubados."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="bg-card rounded-2xl border shadow-sm">
          <div className="grid gap-5 p-6">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Tipo de transporte (fator de cubagem)</span>
              <div
                role="radiogroup"
                aria-label="Tipo de transporte"
                className="grid grid-cols-2 gap-2"
              >
                {(['RODOVIARIO', 'AEREO'] as const).map((m) => {
                  const Icone = m === 'AEREO' ? Plane : Truck;
                  const ativo = estado.modal === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setEstado((e) => ({ ...e, modal: m }))}
                      className={cn(
                        'flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-all sm:flex-row sm:gap-2',
                        ativo
                          ? 'border-primary bg-primary/8 text-primary ring-primary/20 ring-2'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icone className="size-4" />
                        {m === 'AEREO' ? 'Aéreo' : 'Rodoviário'}
                      </span>
                      <span className="text-xs font-normal opacity-70">
                        fator {formatNumero(FATOR_CUBAGEM[m], 0, 3)} kg/m³
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <AnimatePresence initial={false}>
                {estado.linhas.map((l, i) => {
                  const v = calc.porLinha.get(i);
                  const erroLinha = calc.erro?.linha === i ? calc.erro : null;
                  const incompleta = tocada(l) && !completa(l);
                  const erroDe = (campo: string) =>
                    erroLinha?.campo === campo ? erroLinha.mensagem : null;
                  return (
                    <motion.div
                      key={l.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="bg-muted/30 rounded-xl border p-4"
                      data-testid={`volume-${i + 1}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Box className="text-primary size-4" /> Volume {i + 1}
                          {v && (
                            <span className="text-muted-foreground tabular ml-1 text-xs font-normal">
                              {formatNumero(v.volumeM3Unitario, 3)} m³/un
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => duplicar(l.id)}
                            aria-label={`Duplicar volume ${i + 1}`}
                            title="Duplicar"
                          >
                            <CopyPlus />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive size-8"
                            onClick={() => remover(l.id)}
                            aria-label={`Remover volume ${i + 1}`}
                            title="Remover"
                            disabled={estado.linhas.length === 1 && !tocada(l)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {(
                          [
                            ['c', 'comprimentoM', 'Comprimento', 'm', 3],
                            ['l', 'larguraM', 'Largura', 'm', 3],
                            ['a', 'alturaM', 'Altura', 'm', 3],
                            ['peso', 'pesoBrutoKg', 'Peso bruto', 'kg', 3],
                          ] as const
                        ).map(([k, campo, rot, un, casas]) => (
                          <Field key={k} id={`v${i + 1}-${k}`} rotulo={rot} erro={erroDe(campo)}>
                            <NumberInput
                              id={`v${i + 1}-${k}`}
                              valor={l[k]}
                              onValor={(x) => setLinha(l.id, k, x)}
                              casas={casas}
                              sufixo={un}
                              placeholder="0,00"
                              aria-invalid={!!erroDe(campo)}
                            />
                          </Field>
                        ))}
                        <Field id={`v${i + 1}-qtd`} rotulo="Qtd." erro={erroDe('quantidade')}>
                          <NumberInput
                            id={`v${i + 1}-qtd`}
                            valor={l.qtd}
                            onValor={(x) => setLinha(l.id, 'qtd', x)}
                            casas={0}
                            placeholder="1"
                          />
                        </Field>
                      </div>
                      {incompleta && !erroLinha && (
                        <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                          <Info className="size-3.5" /> Preencha comprimento, largura e altura para
                          incluir este volume.
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
          <div className="bg-muted/30 flex flex-wrap gap-2 border-t px-6 py-4">
            <Button type="button" onClick={adicionar}>
              <Plus /> Adicionar volume
            </Button>
            <Button type="button" variant="outline" onClick={() => void copiar()}>
              <Copy /> Copiar resumo
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto"
              disabled={vazio}
              onClick={() => setConfirmar(true)}
            >
              <Eraser /> Limpar
            </Button>
          </div>
        </div>

        <div className="lg:sticky lg:top-6">
          <div className="bg-card overflow-hidden rounded-2xl border shadow-sm" aria-live="polite">
            <div className="from-primary/8 to-brand-accent/6 flex items-center gap-3 border-b bg-gradient-to-br px-6 py-5">
              <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
                <Scale className="size-4.5" />
              </span>
              <div>
                <div className="font-semibold">Resultado da cubagem</div>
                <div className="text-muted-foreground text-xs">
                  {estado.modal === 'AEREO' ? 'Aéreo' : 'Rodoviário'} · fator{' '}
                  {formatNumero(FATOR_CUBAGEM[estado.modal], 0, 3)} kg/m³
                </div>
              </div>
            </div>
            {!r ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="bg-muted text-muted-foreground mb-3 flex size-12 items-center justify-center rounded-xl">
                  <Package className="size-5" />
                </div>
                <div className="font-medium">Aguardando medidas</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {calc.erro
                    ? `Volume ${calc.erro.linha + 1}: ${calc.erro.mensagem}`
                    : 'Informe as medidas de pelo menos um volume.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 p-6">
                <div className="bg-primary text-primary-foreground rounded-xl px-5 py-5 text-center">
                  <div className="text-sm opacity-85">Peso taxado total</div>
                  <motion.div
                    key={r.pesoTaxadoTotal.toString()}
                    initial={{ opacity: 0.4, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="tabular mt-1 text-4xl font-bold tracking-tight"
                    data-testid="cubagem-taxado"
                  >
                    {formatPeso(r.pesoTaxadoTotal)}
                  </motion.div>
                  <div className="mt-1 text-xs opacity-75">
                    {r.pesoBrutoTotal.gte(r.pesoCubadoTotal)
                      ? 'Prevaleceu o peso bruto'
                      : 'Prevaleceu o peso cubado'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Total
                    rotulo="Peso bruto total"
                    valor={formatPeso(r.pesoBrutoTotal)}
                    testid="cubagem-bruto"
                  />
                  <Total
                    rotulo="Peso cubado total"
                    valor={formatPeso(r.pesoCubadoTotal)}
                    testid="cubagem-cubado"
                  />
                  <Total rotulo="Volume total" valor={`${formatNumero(r.volumeM3Total, 3)} m³`} />
                  <Total
                    rotulo="Quantidade"
                    valor={`${r.quantidadeTotal} ${r.quantidadeTotal === 1 ? 'unidade' : 'unidades'}`}
                  />
                </div>
                <div className="grid gap-2">
                  {estado.linhas.map((_, i) => {
                    const v = calc.porLinha.get(i);
                    if (!v) return null;
                    return (
                      <div key={i} className="rounded-lg border px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between font-medium">
                          <span>Volume {i + 1}</span>
                          {v.quantidade > 1 && (
                            <span className="text-muted-foreground text-xs">
                              {v.quantidade} unidades
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground tabular mt-1 grid grid-cols-3 gap-2 text-xs">
                          <span>Bruto {formatPeso(v.pesoBruto)}</span>
                          <span>Cubado {formatPeso(v.pesoCubado)}</span>
                          <span className="text-foreground text-right font-medium">
                            Taxado {formatPeso(v.pesoTaxado)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        aberto={confirmar}
        onAbertoChange={setConfirmar}
        titulo="Limpar a cubagem?"
        descricao="Todos os volumes serão apagados."
        confirmar="Limpar"
        onConfirmar={limpar}
      />
    </Page>
  );
}

function Total({ rotulo, valor, testid }: { rotulo: string; valor: string; testid?: string }) {
  return (
    <div className="bg-muted/50 rounded-xl px-4 py-3">
      <div className="text-muted-foreground text-xs">{rotulo}</div>
      <div className="tabular mt-0.5 font-semibold" data-testid={testid}>
        {valor}
      </div>
    </div>
  );
}
