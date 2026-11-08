import { ExternalLink, KeyRound, LogOut, Moon, PanelLeft, Plus, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { ehAdmin, useLogout, useMe } from '@/lib/auth';
import { useLinksUteis } from '@/lib/links';
import { useTheme } from '@/lib/theme';
import { gruposVisiveis } from './nav';

interface Props {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  onAlternarMenu: () => void;
}

/** Paleta de comandos (Ctrl+K): navegar, ações rápidas e links úteis. */
export function CommandPalette({ aberto, onAbertoChange, onAlternarMenu }: Props) {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: links } = useLinksUteis();
  const { theme, toggleTheme } = useTheme();
  const logout = useLogout();

  const executar = (fn: () => void) => {
    onAbertoChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={aberto}
      onOpenChange={onAbertoChange}
      title="Paleta de comandos"
      description="Procure uma tela ou ação"
    >
      <CommandInput placeholder="Procure uma tela ou ação…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ações">
          <CommandItem
            value="nova cotação spot frete"
            onSelect={() => executar(() => navigate('/spot'))}
          >
            <Plus />
            Nova cotação Spot
          </CommandItem>
          <CommandItem
            value="novo cliente cadastrar"
            onSelect={() => executar(() => navigate('/clientes?novo=1'))}
          >
            <Plus />
            Novo cliente
          </CommandItem>
          <CommandItem
            value="nova cotação ftl fiat km"
            onSelect={() => executar(() => navigate('/ftl'))}
          >
            <Plus />
            Nova cotação FTL
          </CommandItem>
          {(ehAdmin(user) || user?.canEditRates) && (
            <CommandItem
              value="nova tarifa aérea cadastrar"
              onSelect={() => executar(() => navigate('/tarifas-aereas?novo=1'))}
            >
              <Plus />
              Nova tarifa aérea
            </CommandItem>
          )}
          {ehAdmin(user) && (
            <CommandItem
              value="novo usuário cadastrar"
              onSelect={() => executar(() => navigate('/admin/usuarios?novo=1'))}
            >
              <Plus />
              Novo usuário
            </CommandItem>
          )}
          <CommandItem value="alternar tema claro escuro" onSelect={() => executar(toggleTheme)}>
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </CommandItem>
          <CommandItem
            value="recolher expandir menu lateral"
            onSelect={() => executar(onAlternarMenu)}
          >
            <PanelLeft />
            Recolher / expandir menu
            <CommandShortcut>Ctrl B</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {gruposVisiveis(ehAdmin(user)).map((g) => (
          <CommandGroup key={g.titulo} heading={g.titulo}>
            {g.itens.map((i) => (
              <CommandItem
                key={i.to}
                value={`${i.rotulo} ${i.palavras ?? ''}`}
                onSelect={() => executar(() => navigate(i.to))}
              >
                <i.icone />
                {i.rotulo}
                {i.emBreve && <CommandShortcut>em breve</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {links && links.length > 0 && (
          <CommandGroup heading="Links úteis">
            {links.map((l) => (
              <CommandItem
                key={l.id}
                value={`link ${l.name}`}
                onSelect={() => executar(() => window.open(l.url, '_blank', 'noopener,noreferrer'))}
              >
                <ExternalLink />
                {l.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Conta">
          <CommandItem
            value="trocar minha senha"
            onSelect={() => executar(() => navigate('/minha-conta'))}
          >
            <KeyRound />
            Trocar minha senha
          </CommandItem>
          <CommandItem
            value="sair logout"
            onSelect={() =>
              executar(() =>
                logout.mutate(undefined, {
                  onSettled: () => navigate('/login', { replace: true }),
                }),
              )
            }
          >
            <LogOut />
            Sair
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
