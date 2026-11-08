import { formatNumero, UFS } from '@jat/core';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Localidade, type TabelaFtl, type VeiculoFtl } from '@/lib/api';
import { REGIAO_UF, ROTULO_LOCALIDADE, ROTULO_VEICULO, VEICULOS } from './comum';

export type AlvoTabela = { modo: 'nova' } | { modo: 'editar' | 'duplicar'; tabela: TabelaFtl };

interface Form {
  uf: string;
  region: string;
  locality: Localidade;
  perKm: Record<VeiculoFtl, string>;
  adValoremPct: string;
  active: boolean;
  notes: string;
}

function inicial(alvo: AlvoTabela): Form {
  if (alvo.modo === 'nova') {
    return {
      uf: '',
      region: '',
      locality: 'CAPITAL',
      perKm: { UTILITARIO: '', VAN: '', TRES_QUARTOS: '' },
      adValoremPct: '',
      active: true,
      notes: '',
    };
  }
  const t = alvo.tabela;
  const n = (v: string) => formatNumero(v, 2, 4);
  return {
    uf: alvo.modo === 'duplicar' ? '' : t.uf,
    region: alvo.modo === 'duplicar' ? '' : t.region,
    locality: t.locality,
    perKm: {
      UTILITARIO: n(t.perKm.UTILITARIO),
      VAN: n(t.perKm.VAN),
      TRES_QUARTOS: n(t.perKm.TRES_QUARTOS),
    },
    adValoremPct: n(t.adValoremPct),
    active: alvo.modo === 'duplicar' ? true : t.active,
    notes: t.notes ?? '',
  };
}

export function TabelaDialog({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: AlvoTabela | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        {alvo && (
          <TabelaForm
            key={alvo.modo === 'nova' ? 'nova' : `${alvo.modo}-${alvo.tabela.id}`}
            alvo={alvo}
            onFechar={onFechar}
            onSalvo={onSalvo}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabelaForm({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: AlvoTabela;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Form>(() => inicial(alvo));
  const editar = alvo.modo === 'editar';
  const salvar = useMutation({
    mutationFn: () =>
      editar
        ? api.put<{ rate: TabelaFtl }>(`/api/ftl/rates/${alvo.tabela.id}`, form)
        : api.post<{ rate: TabelaFtl }>('/api/ftl/rates', form),
    onSuccess: ({ rate }) => {
      const nome = `${rate.uf} ${ROTULO_LOCALIDADE[rate.locality]}`;
      toast.success(
        editar
          ? rate.version > alvo.tabela.version
            ? `Tabela ${nome} salva (versão ${rate.version}).`
            : 'Nenhuma alteração.'
          : `Tabela ${nome} cadastrada.`,
      );
      onSalvo();
      onFechar();
    },
  });
  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const erroDe = (c: string) => (erro?.campo === c ? erro.message : null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {alvo.modo === 'nova'
            ? 'Nova tabela de preço'
            : alvo.modo === 'duplicar'
              ? 'Duplicar tabela'
              : `Editar tabela (v${alvo.tabela.version})`}
        </DialogTitle>
        <DialogDescription>
          {editar
            ? 'Ao salvar, a versão atual vai para o histórico. Cotações já salvas não mudam.'
            : 'Só pode haver uma tabela ativa por UF e tipo de localidade.'}
        </DialogDescription>
      </DialogHeader>
      {erro && !erro.campo && <FormError mensagem={erro.message} />}

      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
        <Field id="tf-uf" rotulo="UF" obrigatorio erro={erroDe('uf')}>
          <Select
            value={form.uf}
            onValueChange={(uf) =>
              setForm((f) => ({ ...f, uf, region: f.region || REGIAO_UF[uf] || '' }))
            }
          >
            <SelectTrigger id="tf-uf" className="w-full" aria-invalid={!!erroDe('uf')}>
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(UFS).map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="tf-regiao" rotulo="Região" obrigatorio erro={erroDe('region')}>
          <Input
            id="tf-regiao"
            value={form.region}
            onChange={(e) => set('region', e.target.value)}
            aria-invalid={!!erroDe('region')}
          />
        </Field>
        <div className="grid content-start gap-1.5">
          <span className="text-sm leading-none font-medium">Tipo</span>
          <Segmentado
            rotulo="Tipo de localidade"
            valor={form.locality}
            onChange={(v) => set('locality', v)}
            opcoes={[
              { valor: 'CAPITAL', rotulo: 'Capital' },
              { valor: 'INTERIOR', rotulo: 'Interior' },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {VEICULOS.map((v) => (
          <Field
            key={v}
            id={`tf-${v}`}
            rotulo={`${ROTULO_VEICULO[v]} (R$/km)`}
            obrigatorio
            erro={erroDe(`perKm.${v}`)}
          >
            <NumberInput
              id={`tf-${v}`}
              valor={form.perKm[v]}
              onValor={(x) => set('perKm', { ...form.perKm, [v]: x })}
              casas={4}
              prefixo="R$"
              placeholder="0,00"
              aria-invalid={!!erroDe(`perKm.${v}`)}
            />
          </Field>
        ))}
        <Field id="tf-av" rotulo="Ad valorem" obrigatorio erro={erroDe('adValoremPct')}>
          <NumberInput
            id="tf-av"
            valor={form.adValoremPct}
            onValor={(x) => set('adValoremPct', x)}
            casas={4}
            sufixo="%"
            placeholder="0,00"
            aria-invalid={!!erroDe('adValoremPct')}
          />
        </Field>
      </div>

      <Field id="tf-obs" rotulo="Observações (opcional)" erro={erroDe('notes')}>
        <Textarea
          id="tf-obs"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Switch id="tf-ativa" checked={form.active} onCheckedChange={(v) => set('active', v)} />
        <Label htmlFor="tf-ativa" className="font-normal">
          Tabela ativa (usada na calculadora)
        </Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          {editar ? 'Salvar nova versão' : 'Cadastrar tabela'}
        </Button>
      </DialogFooter>
    </form>
  );
}
