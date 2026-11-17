import { ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { Logo } from '@/components/logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ehAdmin, useMe } from '@/lib/auth';
import { useLinksUteis } from '@/lib/links';
import { cn } from '@/lib/utils';
import { gruposVisiveis, type ItemNav } from './nav';

interface Props {
  recolhido: boolean;
  onAlternar: () => void;
  /** Usado no menu móvel: fecha ao navegar. */
  onNavegar?: () => void;
}

export function Sidebar({ recolhido, onAlternar, onNavegar }: Props) {
  const { data: user } = useMe();
  const { data: links } = useLinksUteis();
  const grupos = gruposVisiveis(ehAdmin(user));

  return (
    <aside
      className={cn(
        'bg-sidebar flex h-full flex-col border-r transition-[width] duration-200 ease-out',
        recolhido ? 'w-[68px]' : 'w-64',
      )}
      aria-label="Menu principal"
    >
      <div
        className={cn('flex h-16 shrink-0 items-center px-4', recolhido && 'justify-center px-0')}
      >
        <Logo withText={!recolhido} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {grupos.map((g) => (
          <div key={g.titulo}>
            {!recolhido && (
              <div className="text-muted-foreground/80 mb-1.5 px-2 text-[11px] font-medium tracking-wider uppercase">
                {g.titulo}
              </div>
            )}
            <ul className="space-y-0.5">
              {g.itens.map((item) => (
                <li key={item.to}>
                  <ItemMenu item={item} recolhido={recolhido} onNavegar={onNavegar} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {links && links.length > 0 && (
          <div>
            {!recolhido && (
              <div className="text-muted-foreground/80 mb-1.5 px-2 text-[11px] font-medium tracking-wider uppercase">
                Links úteis
              </div>
            )}
            <ul className="space-y-0.5">
              {links.map((l) => (
                <li key={l.id}>
                  <ComDica rotulo={l.name} ativo={recolhido}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors',
                        recolhido && 'justify-center',
                      )}
                    >
                      <ExternalLink className="size-4 shrink-0" />
                      {!recolhido && <span className="truncate">{l.name}</span>}
                    </a>
                  </ComDica>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={onAlternar}
          className={cn(
            'text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm transition-colors',
            recolhido && 'justify-center',
          )}
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          title={`${recolhido ? 'Expandir' : 'Recolher'} menu (Ctrl+B)`}
        >
          {recolhido ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!recolhido && (
            <>
              <span>Recolher menu</span>
              <kbd className="ml-auto">Ctrl B</kbd>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function ItemMenu({
  item,
  recolhido,
  onNavegar,
}: {
  item: ItemNav;
  recolhido: boolean;
  onNavegar?: () => void;
}) {
  const Icone = item.icone;
  return (
    <ComDica rotulo={item.emBreve ? `${item.rotulo} (em breve)` : item.rotulo} ativo={recolhido}>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={onNavegar}
        className={({ isActive }) =>
          cn(
            'group relative flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            recolhido && 'justify-center',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="from-quote to-quote-2 absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-gradient-to-b" />
            )}
            <Icone className="size-4 shrink-0" />
            {!recolhido && <span className="truncate">{item.rotulo}</span>}
            {!recolhido && item.emBreve && (
              <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
                Em breve
              </span>
            )}
          </>
        )}
      </NavLink>
    </ComDica>
  );
}

function ComDica({
  rotulo,
  ativo,
  children,
}: {
  rotulo: string;
  ativo: boolean;
  children: React.ReactElement;
}) {
  if (!ativo) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{rotulo}</TooltipContent>
    </Tooltip>
  );
}
