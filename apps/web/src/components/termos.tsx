import { temCondicoes, topicosLimpos, type Condicoes } from '@jat/core';
import type { Configuracoes, Cotacao } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Termos de uma cotação: os gravados nela; nas cotações anteriores a 17/11/2026 (sem termos
 * gravados), os atuais das Configurações para o modal (Spot) ou veículo (FTL).
 */
export function termosDaCotacao(
  q: Pick<Cotacao, 'terms' | 'modal' | 'ftl'>,
  cfg: Configuracoes | undefined,
): Condicoes | null {
  if (q.terms) return q.terms;
  if (!cfg) return null;
  if (q.modal === 'FTL') return cfg.condicoesFtl[q.ftl?.vehicle ?? 'VAN'];
  return cfg.condicoesSpot[q.modal];
}

/** Lista (tópicos) ou texto livre, em letra pequena — não compete com o total. */
export function BlocoTermos({
  condicoes,
  titulo = 'Termos e condições',
  className,
  vazio,
}: {
  condicoes: Condicoes | null | undefined;
  titulo?: string;
  className?: string;
  /** Mensagem quando não há termos (padrão: não mostra nada). */
  vazio?: string;
}) {
  if (!temCondicoes(condicoes)) {
    return vazio ? (
      <div className={className}>
        {titulo && <TituloTermos>{titulo}</TituloTermos>}
        <p className="text-muted-foreground text-xs italic">{vazio}</p>
      </div>
    ) : null;
  }
  return (
    <div className={className} data-testid="termos">
      {titulo && <TituloTermos>{titulo}</TituloTermos>}
      {condicoes.formato === 'TOPICOS' ? (
        <ul className="text-muted-foreground grid gap-1 text-xs leading-relaxed">
          {topicosLimpos(condicoes).map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="bg-quote/70 mt-[7px] size-1 shrink-0 rounded-full" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
          {condicoes.texto.trim()}
        </p>
      )}
    </div>
  );
}

function TituloTermos({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wider uppercase',
      )}
    >
      {children}
    </div>
  );
}
