import { cn } from '@/lib/utils';

/** Texto do rodapé definido em 14/11/2026. */
export const TEXTO_RODAPE =
  'JAT Quote © 2027 - Sistema de Cotações Logísticas | Desenvolvido por Igor Cruz';

export function Rodape({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'text-muted-foreground px-4 py-4 text-center text-xs text-balance md:px-6',
        className,
      )}
    >
      {TEXTO_RODAPE}
    </footer>
  );
}
