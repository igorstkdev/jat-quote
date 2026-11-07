import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Rótulo + campo + dica/erro, com acessibilidade (aria-describedby). */
export function Field({
  id,
  rotulo,
  erro,
  dica,
  obrigatorio,
  children,
  className,
}: {
  id: string;
  rotulo: string;
  erro?: string | null;
  dica?: ReactNode;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-destructive text-xs" role="alert">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="text-muted-foreground text-xs">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

/** Erro geral de formulário. */
export function FormError({ mensagem }: { mensagem?: string | null }) {
  if (!mensagem) return null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/8 text-destructive rounded-lg border px-3 py-2 text-sm"
    >
      {mensagem}
    </div>
  );
}
