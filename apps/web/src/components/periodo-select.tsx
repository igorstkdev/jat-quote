import { CalendarRange } from 'lucide-react';
import { Fragment } from 'react';
import { DateInput } from '@/components/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PERIODOS, type Periodo } from '@/lib/periodo';

export interface ValorPeriodo {
  periodo: Periodo;
  de: string;
  ate: string;
}

/** Seletor de período com atalhos; "Personalizado" abre as duas datas (dd/mm/aaaa). */
export function PeriodoSelect({
  id,
  valor,
  onChange,
}: {
  id: string;
  valor: ValorPeriodo;
  onChange: (v: ValorPeriodo) => void;
}) {
  const personalizado = valor.periodo === 'personalizado';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={valor.periodo}
        onValueChange={(p) => onChange({ ...valor, periodo: p as Periodo })}
      >
        <SelectTrigger id={id} aria-label="Período" className="w-full min-w-44 sm:w-auto">
          <CalendarRange className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map((p) => (
            <Fragment key={p.valor}>
              {p.valor === 'tudo' && <SelectSeparator />}
              <SelectItem value={p.valor}>{p.rotulo}</SelectItem>
            </Fragment>
          ))}
        </SelectContent>
      </Select>
      {personalizado && (
        <div className="flex items-center gap-2">
          <DateInput
            id={`${id}-de`}
            valor={valor.de}
            onChange={(de) => onChange({ ...valor, de })}
            aria-label="De"
            placeholder="De"
            className="tabular w-32"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <DateInput
            id={`${id}-ate`}
            valor={valor.ate}
            onChange={(ate) => onChange({ ...valor, ate })}
            aria-label="Até"
            placeholder="Até"
            className="tabular w-32"
          />
        </div>
      )}
    </div>
  );
}
