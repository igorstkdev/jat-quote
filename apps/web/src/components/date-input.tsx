import { useState } from 'react';
import { Input } from '@/components/ui/input';

/** Converte "dd/mm/aaaa" em "aaaa-mm-dd" (ou null se incompleta/inválida). */
export function brParaIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(`${a}-${mes}-${d}T12:00:00Z`);
  if (
    Number.isNaN(data.getTime()) ||
    data.getUTCDate() !== Number(d) ||
    data.getUTCMonth() + 1 !== Number(mes)
  ) {
    return null;
  }
  return `${a}-${mes}-${d}`;
}

/** Aplica a máscara dd/mm/aaaa enquanto digita. */
export function mascaraData(texto: string): string {
  const n = texto.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

/**
 * Campo de data sempre no padrão brasileiro (dd/mm/aaaa), independente do idioma do navegador.
 * `valor` e `onChange` usam aaaa-mm-dd ("" = vazio).
 */
export function DateInput({
  id,
  valor,
  onChange,
  ...props
}: {
  id: string;
  valor: string;
  onChange: (iso: string) => void;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'id'>) {
  const [texto, setTexto] = useState(() => (valor ? valor.split('-').reverse().join('/') : ''));
  const iso = brParaIso(texto);
  const invalido = texto.length === 10 && !iso;
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={texto}
      aria-invalid={invalido}
      onChange={(e) => {
        const t = mascaraData(e.target.value);
        setTexto(t);
        if (t === '') onChange('');
        else {
          const v = brParaIso(t);
          if (v) onChange(v);
        }
      }}
      className="tabular"
      {...props}
    />
  );
}
