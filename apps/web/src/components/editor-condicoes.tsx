import {
  MAX_TAMANHO_TEXTO,
  MAX_TOPICOS,
  normalizarCondicoes,
  type Condicoes,
  type FormatoCondicoes,
} from '@jat/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/field';
import { Segmentado } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const FORMATOS: { valor: FormatoCondicoes; rotulo: string }[] = [
  { valor: 'TOPICOS', rotulo: 'Tópicos' },
  { valor: 'TEXTO', rotulo: 'Texto livre' },
];

/**
 * Editor de um conjunto de termos: o Admin escolhe TÓPICOS (lista com marcadores, que dá para
 * reordenar) ou TEXTO livre. Trocar o formato não apaga o conteúdo do outro.
 */
export function EditorCondicoes({
  valor,
  onChange,
  rotulo,
}: {
  valor: Condicoes;
  onChange: (c: Condicoes) => void;
  /** Ex.: "Aéreo" — usado nos rótulos de acessibilidade. */
  rotulo: string;
}) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const topicos = valor.topicos;
  const setTopicos = (t: string[]) => onChange({ ...valor, topicos: t });

  const focar = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());
  const adicionar = (depois = topicos.length - 1) => {
    if (topicos.length >= MAX_TOPICOS) return;
    const novo = [...topicos];
    novo.splice(depois + 1, 0, '');
    setTopicos(novo);
    focar(depois + 1);
  };
  const remover = (i: number) => {
    setTopicos(topicos.filter((_, j) => j !== i));
    focar(Math.max(0, i - 1));
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= topicos.length) return;
    const novo = [...topicos];
    [novo[i], novo[j]] = [novo[j]!, novo[i]!];
    setTopicos(novo);
    focar(j);
  };
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    // Enter cria o próximo tópico; Shift+Enter quebra a linha dentro do tópico.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      adicionar(i);
    } else if (e.key === 'Backspace' && topicos[i] === '' && topicos.length > 1) {
      e.preventDefault();
      remover(i);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmentado
          rotulo={`Formato das condições (${rotulo})`}
          valor={valor.formato}
          opcoes={FORMATOS}
          onChange={(f) => onChange({ ...valor, formato: f })}
        />
        <span className="text-muted-foreground text-xs">
          {valor.formato === 'TOPICOS'
            ? 'Enter cria o próximo tópico. Cada tópico sai com um marcador •.'
            : 'O texto sai exatamente como escrito, com as quebras de linha.'}
        </span>
      </div>

      {valor.formato === 'TOPICOS' ? (
        <div className="grid gap-2">
          {topicos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              <ListChecks className="size-5" />
              Nenhum tópico. As cotações saem sem termos e condições.
            </div>
          ) : (
            <ol className="grid gap-2" aria-label={`Tópicos (${rotulo})`}>
              {topicos.map((t, i) => (
                <li key={i} className="group flex items-start gap-2">
                  <span aria-hidden className="bg-quote mt-[13px] size-1.5 shrink-0 rounded-full" />
                  <Textarea
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    value={t}
                    rows={1}
                    onChange={(e) =>
                      setTopicos(topicos.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    onKeyDown={(e) => teclas(e, i)}
                    aria-label={`Tópico ${i + 1} (${rotulo})`}
                    placeholder="Escreva o tópico…"
                    className="field-sizing-content min-h-9 resize-none py-2 text-sm leading-relaxed"
                  />
                  <div className="flex shrink-0 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      aria-label={`Subir o tópico ${i + 1}`}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => mover(i, 1)}
                      disabled={i === topicos.length - 1}
                      aria-label={`Descer o tópico ${i + 1}`}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive size-8"
                      onClick={() => remover(i)}
                      aria-label={`Remover o tópico ${i + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => adicionar()}
              disabled={topicos.length >= MAX_TOPICOS}
            >
              <Plus />
              Adicionar tópico
            </Button>
            <span className="text-muted-foreground ml-auto text-xs tabular">
              {topicos.length} / {MAX_TOPICOS}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Textarea
            value={valor.texto}
            onChange={(e) => onChange({ ...valor, texto: e.target.value })}
            rows={10}
            aria-label={`Texto das condições (${rotulo})`}
            className="text-sm leading-relaxed"
          />
          <span className="text-muted-foreground justify-self-end text-xs tabular">
            {valor.texto.length} / {MAX_TAMANHO_TEXTO}
          </span>
        </div>
      )}
    </div>
  );
}

const igual = (a: Condicoes, b: Condicoes) =>
  JSON.stringify(normalizarCondicoes(a)) === JSON.stringify(normalizarCondicoes(b));

/**
 * Cartão com um conjunto de termos por item (modal do Spot ou veículo do FTL): escolhe o item,
 * edita e salva todos de uma vez.
 */
export function CondicoesPorItem<K extends string>({
  titulo,
  descricao,
  itens,
  valores,
  carregando,
  endpoint,
  mensagemSalvo,
  chaveConfig,
}: {
  titulo: string;
  descricao: string;
  itens: { chave: K; rotulo: string }[];
  valores: Record<K, Condicoes> | undefined;
  carregando: boolean;
  endpoint: string;
  mensagemSalvo: string;
  chaveConfig: readonly unknown[];
}) {
  const qc = useQueryClient();
  const [item, setItem] = useState<K>(itens[0]!.chave);
  const [rascunho, setRascunho] = useState<Partial<Record<K, Condicoes>>>({});
  const atual = (k: K) => rascunho[k] ?? valores?.[k];
  const alterados = valores
    ? itens.filter((i) => rascunho[i.chave] && !igual(rascunho[i.chave]!, valores[i.chave]))
    : [];

  const salvar = useMutation({
    mutationFn: () =>
      api.put(endpoint, {
        conditions: Object.fromEntries(itens.map((i) => [i.chave, atual(i.chave)])),
      }),
    onSuccess: () => {
      setRascunho({});
      toast.success(mensagemSalvo);
      void qc.invalidateQueries({ queryKey: chaveConfig });
    },
  });

  const valorItem = atual(item);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {carregando || !valorItem ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <FormError mensagem={salvar.error?.message} />
            <div role="tablist" aria-label={titulo} className="flex flex-wrap gap-1 border-b">
              {itens.map((i) => {
                const ativo = i.chave === item;
                const mudou = alterados.some((a) => a.chave === i.chave);
                return (
                  <button
                    key={i.chave}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => setItem(i.chave)}
                    className={cn(
                      '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                      ativo
                        ? 'border-quote text-foreground'
                        : 'text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    {i.rotulo}
                    {mudou && (
                      <span className="bg-quote size-1.5 rounded-full" aria-label="alterado" />
                    )}
                  </button>
                );
              })}
            </div>
            <EditorCondicoes
              key={item}
              rotulo={itens.find((i) => i.chave === item)!.rotulo}
              valor={valorItem}
              onChange={(c) => setRascunho((r) => ({ ...r, [item]: c }))}
            />
            <div className="flex items-center gap-3 border-t pt-4">
              <Button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending || alterados.length === 0}
              >
                {salvar.isPending && <Loader2 className="animate-spin" />}
                Salvar condições
              </Button>
              {alterados.length > 0 && (
                <>
                  <Button variant="ghost" onClick={() => setRascunho({})}>
                    Descartar alterações
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    Alterado: {alterados.map((a) => a.rotulo).join(', ')}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
