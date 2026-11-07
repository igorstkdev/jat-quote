import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8', className)}
    >
      {children}
    </motion.div>
  );
}

export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-muted-foreground mt-1 text-sm">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-xl">
        <Icone className="size-5" />
      </div>
      <h3 className="font-medium">{titulo}</h3>
      {descricao && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/** Controle segmentado (ex.: Ativos | Inativos | Todos). */
export function Segmentado<T extends string>({
  valor,
  opcoes,
  onChange,
  rotulo,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="bg-muted inline-flex h-9 rounded-lg p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'rounded-md px-3 text-sm font-medium transition-colors',
            valor === o.valor
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
