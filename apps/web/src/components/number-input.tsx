import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Normaliza o que o operador digita para o padrão brasileiro:
 * só dígitos e UMA vírgula decimal; ponto digitado vira vírgula; limita as casas.
 */
export function normalizarDigitado(texto: string, casas: number): string {
  let t = texto.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const i = t.indexOf(',');
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/,/g, '');
  if (casas === 0) return t.replace(/,/g, '');
  const [int = '', dec] = t.split(',');
  const inteiro = int.replace(/^0+(?=\d)/, '');
  return dec === undefined ? inteiro : `${inteiro || '0'},${dec.slice(0, casas)}`;
}

/** "1234,5" → "1.234,50" (com casas fixas) ao sair do campo. */
export function formatarAoSair(texto: string, casasFixas?: number): string {
  if (texto === '' || texto === ',') return '';
  let [int = '0', dec = ''] = texto.split(',');
  if (casasFixas !== undefined) dec = dec.padEnd(casasFixas, '0').slice(0, casasFixas);
  int = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${int},${dec}` : int;
}

/** Remove os pontos de milhar para edição. */
const paraEdicao = (texto: string) => texto.replace(/\./g, '');

interface Props extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'prefix'> {
  valor: string;
  onValor: (v: string) => void;
  /** Casas decimais aceitas. */
  casas?: number;
  /** Completa as casas ao sair (ex.: dinheiro "10" → "10,00"). */
  casasFixas?: number;
  prefixo?: ReactNode;
  sufixo?: ReactNode;
}

/**
 * Campo numérico no padrão brasileiro. O valor é texto ("1.234,56"),
 * entendido pelo núcleo de cálculo (vírgula = decimal; ponto = milhar).
 */
export function NumberInput({
  valor,
  onValor,
  casas = 2,
  casasFixas,
  prefixo,
  sufixo,
  className,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [focado, setFocado] = useState(false);
  return (
    <div className="relative">
      {prefixo && (
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
          {prefixo}
        </span>
      )}
      <Input
        inputMode="decimal"
        autoComplete="off"
        value={focado ? paraEdicao(valor) : valor}
        onChange={(e) => onValor(normalizarDigitado(e.target.value, casas))}
        onFocus={(e) => {
          setFocado(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocado(false);
          onValor(formatarAoSair(normalizarDigitado(e.target.value, casas), casasFixas));
          onBlur?.(e);
        }}
        className={cn('tabular text-right', prefixo && 'pl-10', sufixo && 'pr-9', className)}
        {...props}
      />
      {sufixo && (
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
          {sufixo}
        </span>
      )}
    </div>
  );
}
