import { useEdicao } from '@/lib/edicao';
import { cn } from '@/lib/utils';

/** Texto do rodapé definido em 14/11/2026. */
export const textoRodape = (produto = 'JAT Quote') =>
  `${produto} © 2027 - Sistema de Cotações Logísticas | Desenvolvido por Igor Cruz`;

export function Rodape({ className }: { className?: string }) {
  const { produto } = useEdicao();
  return (
    <footer
      className={cn(
        'text-muted-foreground px-4 py-4 text-center text-xs text-balance md:px-6',
        className,
      )}
    >
      {textoRodape(produto)}
    </footer>
  );
}
