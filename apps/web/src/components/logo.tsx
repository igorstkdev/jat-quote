import { cn } from '@/lib/utils';

/** Logo oficial (PNG recortado). Para trocar, substitua public/brand/logo-jat.png. */
export const LOGO_URL = '/brand/logo-jat.png';
/** Clicar na logo abre o site do Grupo JAT (14/11/2026). */
export const SITE_JAT = 'https://www.grupojat.com.br/';

/**
 * Logo do Grupo JAT + nome do sistema.
 * - `branco`: força a versão branca (fundos escuros, ex.: painel do login).
 * - No tema escuro a logo azul vira branca automaticamente.
 * - `link`: a imagem abre o site do Grupo JAT em nova aba (padrão).
 */
export function Logo({
  className,
  withText = true,
  branco = false,
  link = true,
}: {
  className?: string;
  withText?: boolean;
  branco?: boolean;
  link?: boolean;
}) {
  const imagem = (
    <img
      src={LOGO_URL}
      alt="Grupo JAT"
      width={197}
      height={74}
      className={cn(
        'w-auto shrink-0 select-none',
        withText ? 'h-8' : 'h-5',
        branco ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert',
      )}
      draggable={false}
    />
  );
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {link ? (
        <a
          href={SITE_JAT}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir o site do Grupo JAT"
          aria-label="Grupo JAT: abrir o site em nova aba"
          className="focus-visible:ring-ring/50 flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {imagem}
        </a>
      ) : (
        imagem
      )}
      {withText && (
        <span
          className={cn(
            'flex flex-col border-l pl-3 leading-none',
            branco ? 'border-white/25' : 'border-border',
          )}
        >
          <span className="text-[15px] font-semibold tracking-tight">Quote</span>
          <span
            className={cn('mt-1 text-[11px]', branco ? 'text-white/65' : 'text-muted-foreground')}
          >
            Cotação de Fretes
          </span>
        </span>
      )}
    </span>
  );
}
