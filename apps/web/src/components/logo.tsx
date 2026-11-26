import { useEdicao } from '@/lib/edicao';
import { cn } from '@/lib/utils';

/** Logo oficial do Grupo JAT (PNG recortado). */
export const LOGO_URL = '/brand/logo-jat.png';
/**
 * Logo do Quote (marca do produto, 16/11/2026), gerada por scripts/gerar-logos-quote.ps1:
 * fundo claro ("Q" no azul JAT) e fundo escuro ("Q" branco, o original); completa (com
 * "Cotações de Fretes") ou compacta (sem o subtítulo, para tamanhos pequenos).
 */
const LOGOS_QUOTE = {
  completa: { claro: '/brand/logo-quote.png', escuro: '/brand/logo-quote-branco.png' },
  compacta: {
    claro: '/brand/logo-quote-compacta.png',
    escuro: '/brand/logo-quote-compacta-branco.png',
  },
} as const;
/** Logo da JAT sem o "GRUPO" (17/11/2026): canto da prévia da cotação. */
export const LOGO_JAT_CLEAN_URL = '/brand/logo-jat-clean.png';

/** Logo da JAT na prévia da cotação (azul; branca no tema escuro). Decorativa. */
export function LogoJatPrevia({ className }: { className?: string }) {
  const { demo } = useEdicao();
  // Edição demo: no lugar da JAT, o Quote (25/11/2026).
  if (demo) return <LogoQuote completa={false} branco={false} className={cn('h-9', className)} />;
  return (
    <img
      src={LOGO_JAT_CLEAN_URL}
      alt="JAT"
      width={500}
      height={230}
      className={cn('h-7 w-auto shrink-0 select-none dark:brightness-0 dark:invert', className)}
      draggable={false}
    />
  );
}

/** Clicar na logo da JAT abre o site do Grupo JAT (14/11/2026). */
export const SITE_JAT = 'https://www.grupojat.com.br/';

const TAMANHOS = {
  /** Menu lateral, cabeçalhos. */
  md: { jat: 'h-7', quote: 'h-10', divisor: 'h-8', gap: 'gap-3' },
  /** Destaque (login). */
  lg: { jat: 'h-12', quote: 'h-20', divisor: 'h-16', gap: 'gap-5' },
} as const;

/**
 * Logos lado a lado: Grupo JAT (cliente) | Quote (produto).
 * - `withText`: mostra a logo do Quote (sem ela, só a da JAT — ex.: menu recolhido).
 * - `branco`: força a JAT branca (fundos escuros, ex.: painel do login).
 *   No tema escuro a JAT azul vira branca automaticamente; o Quote laranja serve nos dois temas.
 * - `link`: a logo da JAT abre o site do Grupo JAT em nova aba (padrão).
 * - `tamanho="lg"`: versão maior, com o subtítulo "Cotações de Fretes" do Quote.
 */
export function Logo({
  className,
  withText = true,
  branco = false,
  link = true,
  tamanho = 'md',
}: {
  className?: string;
  withText?: boolean;
  branco?: boolean;
  link?: boolean;
  tamanho?: keyof typeof TAMANHOS;
}) {
  const t = TAMANHOS[tamanho];
  const { demo, conhecida } = useEdicao();
  // Edição demo (25/11/2026) — e enquanto a edição não é conhecida — só a marca Quote.
  if (demo || !conhecida) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        {withText ? (
          <LogoQuote completa={tamanho === 'lg'} branco={branco} className={t.quote} />
        ) : (
          <img src="/favicon.png" alt="Quote" className="size-8 select-none" draggable={false} />
        )}
      </span>
    );
  }
  const jat = (
    <img
      src={LOGO_URL}
      alt="Grupo JAT"
      width={197}
      height={74}
      className={cn(
        'w-auto shrink-0 select-none',
        withText ? t.jat : 'h-5',
        branco ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert',
      )}
      draggable={false}
    />
  );
  return (
    <span className={cn('inline-flex items-center', t.gap, className)}>
      {link ? (
        <a
          href={SITE_JAT}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir o site do Grupo JAT"
          aria-label="Grupo JAT: abrir o site em nova aba"
          className="focus-visible:ring-ring/50 flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {jat}
        </a>
      ) : (
        jat
      )}
      {withText && (
        <>
          <span
            aria-hidden
            className={cn('w-px shrink-0', t.divisor, branco ? 'bg-white/25' : 'bg-border')}
          />
          <LogoQuote completa={tamanho === 'lg'} branco={branco} className={t.quote} />
        </>
      )}
    </span>
  );
}

/** Logo do Quote: troca a versão conforme o tema (ou sempre a branca, sobre fundo escuro). */
function LogoQuote({
  completa,
  branco,
  className,
}: {
  completa: boolean;
  branco: boolean;
  className: string;
}) {
  const v = LOGOS_QUOTE[completa ? 'completa' : 'compacta'];
  const alt = completa ? 'Quote — Cotações de Fretes' : 'Quote';
  const comum = cn('w-auto shrink-0 select-none', className);
  const img = (src: string, extra?: string) => (
    <img
      src={src}
      alt={alt}
      width={1492}
      height={523}
      className={cn(comum, extra)}
      draggable={false}
    />
  );
  if (branco) return img(v.escuro);
  return (
    <>
      {img(v.claro, 'dark:hidden')}
      {img(v.escuro, 'hidden dark:block')}
    </>
  );
}
