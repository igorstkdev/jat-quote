import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { ClienteDialog } from '@/components/cliente-dialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, type Cliente } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';

export interface ClienteSel {
  id: string;
  name: string;
  email: string | null;
}

/** Seleção de cliente ATIVO, com "cadastrar novo" sem sair da tela. */
export function ClientCombobox({
  id,
  valor,
  onChange,
  invalido,
  disabled,
}: {
  id: string;
  valor: ClienteSel | null;
  onChange: (c: ClienteSel | null) => void;
  invalido?: boolean;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [novo, setNovo] = useState(false);
  const busca = useDebounce(termo.trim(), 200);

  const lista = useQuery({
    queryKey: ['clients', { termo: busca, status: 'ativos' }],
    queryFn: async () =>
      (
        await api.get<{ clients: Cliente[] }>(
          `/api/clients?status=ativos&search=${encodeURIComponent(busca)}`,
        )
      ).clients,
    enabled: aberto,
    placeholderData: (a) => a,
  });

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            aria-invalid={invalido}
            disabled={disabled}
            className={cn(
              'w-full justify-between px-3 font-normal',
              !valor && 'text-muted-foreground',
              invalido && 'border-destructive',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{valor?.name ?? 'Selecione o cliente'}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar cliente…" value={termo} onValueChange={setTermo} />
            <CommandList>
              <CommandEmpty>
                {lista.isFetching ? 'Buscando…' : 'Nenhum cliente encontrado.'}
              </CommandEmpty>
              {lista.data && lista.data.length > 0 && (
                <CommandGroup>
                  {lista.data.slice(0, 50).map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        onChange({ id: c.id, name: c.name, email: c.email });
                        setAberto(false);
                        setTermo('');
                      }}
                    >
                      <span className="flex-1 truncate">{c.name}</span>
                      <Check
                        className={cn('size-4', valor?.id === c.id ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__novo__"
                  onSelect={() => {
                    setAberto(false);
                    setNovo(true);
                  }}
                >
                  <Plus />
                  Cadastrar novo cliente{termo.trim() ? ` “${termo.trim()}”` : ''}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <ClienteDialog
        cliente={novo ? 'novo' : null}
        nomeInicial={termo.trim()}
        onFechar={() => {
          setNovo(false);
          setTermo('');
        }}
        onSalvo={(c) => onChange({ id: c.id, name: c.name, email: c.email })}
      />
    </>
  );
}
