import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
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
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Cliente } from '@/lib/api';
import { formatDocumento } from '@/lib/format';

const VAZIO = { name: '', document: '', contact: '', email: '', phone: '', notes: '' };

export function ClienteDialog({
  cliente,
  onFechar,
  onSalvo,
  nomeInicial,
}: {
  cliente: Cliente | 'novo' | null;
  onFechar: () => void;
  /** Chamado com o cliente salvo (ex.: selecionar na cotação). */
  onSalvo?: (c: Cliente) => void;
  /** Nome sugerido ao cadastrar (ex.: o que foi digitado na busca). */
  nomeInicial?: string;
}) {
  return (
    <Dialog open={!!cliente} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {cliente && (
          <ClienteForm
            key={cliente === 'novo' ? 'novo' : cliente.id}
            cliente={cliente}
            onFechar={onFechar}
            onSalvo={onSalvo}
            nomeInicial={nomeInicial}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClienteForm({
  cliente,
  onFechar,
  onSalvo,
  nomeInicial,
}: {
  cliente: Cliente | 'novo';
  onFechar: () => void;
  onSalvo?: (c: Cliente) => void;
  nomeInicial?: string;
}) {
  const qc = useQueryClient();
  const novo = cliente === 'novo';
  const [form, setForm] = useState(() =>
    cliente === 'novo'
      ? { ...VAZIO, name: nomeInicial ?? '' }
      : {
          name: cliente.name,
          document: formatDocumento(cliente.document),
          contact: cliente.contact ?? '',
          email: cliente.email ?? '',
          phone: cliente.phone ?? '',
          notes: cliente.notes ?? '',
        },
  );

  const salvar = useMutation({
    mutationFn: () =>
      novo
        ? api.post<{ client: Cliente }>('/api/clients', form)
        : api.patch<{ client: Cliente }>(`/api/clients/${(cliente as Cliente).id}`, form),
    onSuccess: ({ client }) => {
      toast.success(novo ? `Cliente ${client.name} cadastrado.` : 'Alterações salvas.');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onSalvo?.(client);
      onFechar();
    },
  });

  const erro = salvar.error instanceof ApiError ? salvar.error : null;
  const erroDe = (campo: string) => (erro?.campo === campo ? erro.message : null);
  const set = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{novo ? 'Novo cliente' : 'Editar cliente'}</DialogTitle>
        <DialogDescription>Somente o nome é obrigatório.</DialogDescription>
      </DialogHeader>
      {erro && !erro.campo && <FormError mensagem={erro.message} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="c-nome"
          rotulo="Nome"
          obrigatorio
          erro={erroDe('name')}
          className="sm:col-span-2"
        >
          <Input
            id="c-nome"
            value={form.name}
            onChange={set('name')}
            autoFocus
            aria-invalid={!!erroDe('name')}
          />
        </Field>
        <Field id="c-doc" rotulo="CNPJ / CPF" erro={erroDe('document')}>
          <Input
            id="c-doc"
            value={form.document}
            onChange={set('document')}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            aria-invalid={!!erroDe('document')}
          />
        </Field>
        <Field id="c-contato" rotulo="Contato" erro={erroDe('contact')}>
          <Input id="c-contato" value={form.contact} onChange={set('contact')} />
        </Field>
        <Field id="c-email" rotulo="E-mail" erro={erroDe('email')}>
          <Input
            id="c-email"
            type="email"
            value={form.email}
            onChange={set('email')}
            aria-invalid={!!erroDe('email')}
          />
        </Field>
        <Field id="c-tel" rotulo="Telefone" erro={erroDe('phone')}>
          <Input
            id="c-tel"
            value={form.phone}
            onChange={set('phone')}
            inputMode="tel"
            placeholder="(11) 0000-0000"
          />
        </Field>
        <Field id="c-obs" rotulo="Observações" erro={erroDe('notes')} className="sm:col-span-2">
          <Textarea id="c-obs" value={form.notes} onChange={set('notes')} rows={3} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          {novo ? 'Cadastrar' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
