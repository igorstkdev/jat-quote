import { cn } from '@/lib/utils';

/**
 * Logo PLACEHOLDER do JAT Quote.
 * Para trocar pelo logo oficial: substitua o <svg> abaixo (ou importe o arquivo
 * SVG da JAT) e mantenha a mesma interface do componente.
 */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="jat-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--brand-accent)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#jat-logo-g)" />
        <path
          d="M9 21.5 21.5 9M14 9h7.5v7.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">JAT Quote</span>
          <span className="text-muted-foreground mt-1 text-[11px]">Cotação de Fretes</span>
        </span>
      )}
    </span>
  );
}
