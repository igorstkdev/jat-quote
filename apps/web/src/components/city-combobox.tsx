import { buscarMunicipios, formatarCidade, type Municipio } from '@jat/core';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface Cidade {
  nome: string;
  uf: string;
}

/** Cidade da lista oficial do IBGE (autocompletar, funciona sem internet). */
export function CityCombobox({
  id,
  valor,
  onChange,
  placeholder = 'Selecione a cidade',
  invalido,
  disabled,
}: {
  id: string;
  valor: Cidade | null;
  onChange: (c: Cidade | null) => void;
  placeholder?: string;
  invalido?: boolean;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const opcoes = useMemo<Municipio[]>(() => buscarMunicipios(termo, { limite: 30 }), [termo]);

  return (
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
            <MapPin className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{valor ? formatarCidade(valor) : placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite a cidade (ex.: feira ba)"
            value={termo}
            onValueChange={setTermo}
          />
          <CommandList>
            <CommandEmpty>
              {termo.trim()
                ? 'Nenhuma cidade encontrada.'
                : 'Digite para buscar entre os 5.571 municípios.'}
            </CommandEmpty>
            {opcoes.length > 0 && (
              <CommandGroup>
                {opcoes.map((m) => {
                  const sel = valor?.nome === m.nome && valor.uf === m.uf;
                  return (
                    <CommandItem
                      key={m.codigo}
                      value={String(m.codigo)}
                      onSelect={() => {
                        onChange({ nome: m.nome, uf: m.uf });
                        setAberto(false);
                        setTermo('');
                      }}
                    >
                      <span className="flex-1">{m.nome}</span>
                      <span className="text-muted-foreground text-xs font-medium">{m.uf}</span>
                      <Check className={cn('size-4', sel ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
