import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { DateInput } from '@/components/date-input';
import { Field, FormError } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Segmentado } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Companhia, type Nivel, type TarifaAerea } from '@/lib/api';
import { formatNumero } from '@jat/core';
import { COMPANHIAS, NIVEIS, ROTULO_NIVEL } from './comum';

export type AlvoTarifa =
  | { modo: 'nova' }
  | { modo: 'editar'; tarifa: TarifaAerea }
  | { modo: 'duplicar'; tarifa: TarifaAerea };

interface Form {
  origin: string;
  destination: string;
  airline: Companhia;
  validFrom: string;
  validTo: string;
  active: boolean;
  levels: Record<Nivel, { perKg: string; min: string }>;
  notes: string;
}

const NIVEIS_VAZIOS = {
  URGENTE: { perKg: '', min: '' },
  RAPIDO: { perKg: '', min: '' },
  ECONOMICO: { perKg: '', min: '' },
};

function formInicial(alvo: AlvoTarifa): Form {
  if (alvo.modo === 'nova') {
    return {
      origin: '',
      destination: '',
      airline: 'GOL',
      validFrom: '',
      validTo: '',
      active: true,
      levels: NIVEIS_VAZIOS,
      notes: '',
    };
  }
  const t = alvo.tarifa;
  const nivel = (n: Nivel) => {
    const l = t.levels[n];
    return l
      ? { perKg: formatNumero(l.perKg, 2, 4), min: formatNumero(l.min) }
      : { perKg: '', min: '' };
  };
  return {
    origin: t.origin,
    destination: t.destination,
    airline: t.airline,
    validFrom: alvo.modo === 'duplicar' ? '' : t.validFrom,
    validTo: alvo.modo === 'duplicar' ? '' : (t.validTo ?? ''),
    active: alvo.modo === 'duplicar' ? true : t.active,
    levels: { URGENTE: nivel('URGENTE'), RAPIDO: nivel('RAPIDO'), ECONOMICO: nivel('ECONOMICO') },
    notes: t.notes ?? '',
  };
}

export function TarifaDialog({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: AlvoTarifa | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        {alvo && (
          <TarifaForm
            key={alvo.modo === 'nova' ? 'nova' : `${alvo.modo}-${alvo.tarifa.id}`}
            alvo={alvo}
            onFechar={onFechar}
            onSalvo={onSalvo}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TarifaForm({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: AlvoTarifa;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formInicial(alvo));
  const editar = alvo.modo === 'editar';

  const salvar = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        validTo: form.validTo || null,
        ...(alvo.modo === 'duplicar' ? { duplicatedFrom: alvo.tarifa.id } : {}),
      };
      return editar
        ? api.put<{ rate: TarifaAerea }>(`/api/air-rates/${alvo.tarifa.id}`, payload)
        : api.post<{ rate: TarifaAerea }>('/api/air-rates', payload);
    },
    onSuccess: ({ rate }) => {
      const rota = `${rate.airline} ${rate.origin} → ${rate.destination}`;
      toast.success(
        editar
          ? rate.version > alvo.tarifa.version
            ? `Tarifa ${rota} salva (versão ${rate.version}).`
            : 'Nenhuma alteração.'
          : `Tarifa ${rota} cadastrada.`,
      );
      onSalvo();
      onFechar();
    },
  });

  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const erroDe = (...campos: string[]) =>
    erro?.campo && campos.some((c) => erro.campo === c || erro.campo!.startsWith(`${c}.`))
      ? erro.message
      : null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setNivel = (n: Nivel, k: 'perKg' | 'min', v: string) =>
    setForm((f) => ({ ...f, levels: { ...f.levels, [n]: { ...f.levels[n], [k]: v } } }));
  const iata = (v: string) =>
    v
      .replace(/[^a-z]/gi, '')
      .toUpperCase()
      .slice(0, 3);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };

  const campoGeral = erro && (!erro.campo || erro.campo === 'levels');

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {alvo.modo === 'nova'
            ? 'Nova tarifa aérea'
            : alvo.modo === 'duplicar'
              ? 'Duplicar tarifa'
              : `Editar tarifa (v${alvo.tarifa.version})`}
        </DialogTitle>
        <DialogDescription>
          {editar
            ? 'Ao salvar, a versão atual vai para o histórico e a tarifa passa para a próxima versão.'
            : 'Preencha ao menos um nível. Vigência sem data final vale até ser substituída.'}
        </DialogDescription>
      </DialogHeader>
      {campoGeral && <FormError mensagem={erro.message} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Field id="t-origem" rotulo="Origem (IATA)" obrigatorio erro={erroDe('origin')}>
          <Input
            id="t-origem"
            value={form.origin}
            onChange={(e) => set('origin', iata(e.target.value))}
            placeholder="GRU"
            className="font-mono tracking-widest uppercase"
            autoFocus={!editar}
            aria-invalid={!!erroDe('origin')}
          />
        </Field>
        <Field id="t-destino" rotulo="Destino (IATA)" obrigatorio erro={erroDe('destination')}>
          <Input
            id="t-destino"
            value={form.destination}
            onChange={(e) => set('destination', iata(e.target.value))}
            placeholder="SSA"
            className="font-mono tracking-widest uppercase"
            aria-invalid={!!erroDe('destination')}
          />
        </Field>
        <div className="grid content-start gap-1.5">
          <span className="text-sm leading-none font-medium">Companhia</span>
          <Segmentado
            rotulo="Companhia"
            valor={form.airline}
            onChange={(v) => set('airline', v)}
            opcoes={COMPANHIAS.map((c) => ({ valor: c, rotulo: c }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="t-inicio" rotulo="Início da vigência" obrigatorio erro={erroDe('validFrom')}>
          <DateInput
            id="t-inicio"
            valor={form.validFrom}
            onChange={(v) => set('validFrom', v)}
            aria-invalid={!!erroDe('validFrom')}
          />
        </Field>
        <Field
          id="t-fim"
          rotulo="Fim da vigência"
          erro={erroDe('validTo')}
          dica="Em branco: vale até ser substituída."
        >
          <DateInput id="t-fim" valor={form.validTo} onChange={(v) => set('validTo', v)} />
        </Field>
      </div>

      <fieldset className="rounded-xl border">
        <legend className="sr-only">Níveis de serviço</legend>
        <div className="text-muted-foreground bg-muted/40 grid grid-cols-[7rem_1fr_1fr] gap-3 rounded-t-xl border-b px-4 py-2 text-xs font-medium">
          <span>Nível</span>
          <span>Tarifa por kg</span>
          <span>Mínimo</span>
        </div>
        {NIVEIS.map((n) => (
          <div key={n} className="grid grid-cols-[7rem_1fr_1fr] items-start gap-3 px-4 py-2.5">
            <span className="pt-2 text-sm font-medium">{ROTULO_NIVEL[n]}</span>
            <div className="grid gap-1">
              <NumberInput
                id={`t-${n}-kg`}
                aria-label={`${ROTULO_NIVEL[n]}: tarifa por kg`}
                valor={form.levels[n].perKg}
                onValor={(v) => setNivel(n, 'perKg', v)}
                casas={4}
                prefixo="R$"
                placeholder="—"
                aria-invalid={erro?.campo === `levels.${n}.perKg`}
              />
            </div>
            <NumberInput
              id={`t-${n}-min`}
              aria-label={`${ROTULO_NIVEL[n]}: mínimo`}
              valor={form.levels[n].min}
              onValor={(v) => setNivel(n, 'min', v)}
              casasFixas={2}
              prefixo="R$"
              placeholder="—"
              aria-invalid={erro?.campo === `levels.${n}.min`}
            />
            {erro?.campo?.startsWith(`levels.${n}.`) && (
              <p role="alert" className="text-destructive col-span-3 -mt-1 text-xs">
                {erro.message}
              </p>
            )}
          </div>
        ))}
      </fieldset>

      <Field id="t-obs" rotulo="Observações (opcional)" erro={erroDe('notes')}>
        <Textarea
          id="t-obs"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Switch id="t-ativa" checked={form.active} onCheckedChange={(v) => set('active', v)} />
        <Label htmlFor="t-ativa" className="font-normal">
          Tarifa ativa (usada na calculadora durante a vigência)
        </Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          {editar ? 'Salvar nova versão' : 'Cadastrar tarifa'}
        </Button>
      </DialogFooter>
    </form>
  );
}
