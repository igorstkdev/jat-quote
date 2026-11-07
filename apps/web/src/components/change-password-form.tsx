import { Check, Circle, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { regrasSenha, useTrocarSenha } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function ChangePasswordForm({
  onSucesso,
  rotuloBotao = 'Salvar nova senha',
}: {
  onSucesso: () => void;
  rotuloBotao?: string;
}) {
  const trocar = useTrocarSenha();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const regras = regrasSenha(nova);
  const confere = nova.length > 0 && nova === confirma;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErroLocal(null);
    if (!regras.every((r) => r.ok)) return setErroLocal('A nova senha não atende às regras.');
    if (!confere) return setErroLocal('A confirmação não confere com a nova senha.');
    trocar.mutate(
      { currentPassword: atual, newPassword: nova },
      {
        onSuccess: () => {
          setAtual('');
          setNova('');
          setConfirma('');
          onSucesso();
        },
      },
    );
  };

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <FormError mensagem={erroLocal ?? trocar.error?.message} />
      <Field id="senha-atual" rotulo="Senha atual">
        <Input
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          autoFocus
        />
      </Field>
      <Field id="senha-nova" rotulo="Nova senha">
        <Input
          id="senha-nova"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
      </Field>
      <ul className="grid gap-1 text-xs" aria-label="Regras da senha">
        {regras.map((r) => (
          <li
            key={r.texto}
            className={cn(
              'flex items-center gap-2',
              r.ok ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {r.ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
            {r.texto}
          </li>
        ))}
      </ul>
      <Field
        id="senha-confirma"
        rotulo="Confirme a nova senha"
        erro={confirma && !confere ? 'As senhas não conferem.' : null}
      >
        <Input
          id="senha-confirma"
          type="password"
          autoComplete="new-password"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={trocar.isPending} className="mt-1">
        {trocar.isPending && <Loader2 className="animate-spin" />}
        {rotuloBotao}
      </Button>
    </form>
  );
}
