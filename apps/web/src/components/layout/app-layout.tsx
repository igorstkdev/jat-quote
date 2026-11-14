import { Menu, Search } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AvisoLicenca } from '@/components/licenca';
import { Rodape } from '@/components/rodape';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ehAdmin, useMe } from '@/lib/auth';
import { useLocalStorage } from '@/lib/use-local-storage';
import { CommandPalette } from './command-palette';
import { TODOS_ITENS } from './nav';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

export function AppLayout() {
  const [recolhido, setRecolhido] = useLocalStorage('jat-menu-recolhido', false);
  const [paleta, setPaleta] = useState(false);
  const [menuMovel, setMenuMovel] = useState(false);
  const { pathname } = useLocation();

  const alternarMenu = () => setRecolhido((v) => !v);

  // Atalhos globais: Ctrl+K (paleta) e Ctrl+B (menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        setPaleta((v) => !v);
      } else if (k === 'b') {
        e.preventDefault();
        setRecolhido((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setRecolhido]);

  const atual = [...TODOS_ITENS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));

  useEffect(() => {
    document.title = atual ? `${atual.rotulo} · JAT Quote` : 'JAT Quote';
  }, [atual]);

  return (
    <div className="flex h-svh overflow-hidden">
      <div className="hidden md:block">
        <Sidebar recolhido={recolhido} onAlternar={alternarMenu} />
      </div>
      <Sheet open={menuMovel} onOpenChange={setMenuMovel}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar
            recolhido={false}
            onAlternar={() => setMenuMovel(false)}
            onNavegar={() => setMenuMovel(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMenuMovel(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
          <div className="min-w-0 text-sm font-medium">{atual?.rotulo ?? ''}</div>

          <button
            type="button"
            onClick={() => setPaleta(true)}
            className="bg-muted/60 text-muted-foreground hover:bg-muted ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
            aria-label="Abrir paleta de comandos"
          >
            <Search className="size-4" />
            <span className="truncate">Buscar telas e ações…</span>
            <kbd className="ml-auto hidden sm:inline-flex">Ctrl K</kbd>
          </button>
          <ThemeToggle />
          <UserMenu />
        </header>

        <AvisoLicencaAdmin />
        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1">
            <Suspense fallback={<CarregandoPagina />}>
              <Outlet />
            </Suspense>
          </div>
          <Rodape className="border-t" />
        </main>
      </div>

      <CommandPalette aberto={paleta} onAbertoChange={setPaleta} onAlternarMenu={alternarMenu} />
    </div>
  );
}

/** A faixa de vencimento só aparece para Admins (decisão de 14/11/2026). */
function AvisoLicencaAdmin() {
  const { data } = useMe();
  return ehAdmin(data) ? <AvisoLicenca /> : null;
}

export function CarregandoPagina() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="mt-6 h-64 w-full" />
    </div>
  );
}
