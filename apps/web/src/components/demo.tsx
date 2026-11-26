import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, KeyRound, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api } from '@/lib/api';
import { CHAVE_ME, ehAdmin, useMe } from '@/lib/auth';
import { LOGIN_DEMO } from '@/lib/edicao';

/** Faixa no topo da edição de demonstração (25/11/2026). */
export function FaixaDemo() {
  return (
    <div
      role="note"
      className="bg-quote/10 text-quote-texto flex shrink-0 items-center justify-center gap-2 px-4 py-1 text-xs font-medium"
    >
      <FlaskConical className="size-3.5" />
      Ambiente de demonstração · dados fictícios
    </div>
  );
}

/** Caixa no login da demo com o acesso pronto. */
export function AcessoDemo({ onUsar }: { onUsar: () => void }) {
  return (
    <div className="border-quote/40 bg-quote/8 mt-6 rounded-xl border px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <KeyRound className="text-quote size-4" />
        Acesso de demonstração
      </div>
      <div className="text-muted-foreground mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <span>Usuário</span>
        <code className="text-foreground font-semibold">{LOGIN_DEMO.usuario}</code>
        <span>Senha</span>
        <code className="text-foreground font-semibold">{LOGIN_DEMO.senha}</code>
      </div>
      <Button type="button" size="sm" variant="outline" className="mt-3 h-8" onClick={onUsar}>
        Preencher acesso
      </Button>
    </div>
  );
}

const FRASE = 'RESTAURAR DEMO';

/** Configurações da demo: volta todos os dados fictícios ao estado inicial. Só Admin. */
export function RestaurarDemo() {
  const { data: user } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [frase, setFrase] = useState('');
  const restaurar = useMutation({
    mutationFn: () =>
      api.post<{ cotacoes: number }>('/api/demo/restaurar', { confirmation: frase }),
    onSuccess: ({ cotacoes }) => {
      toast.success(`Demonstração restaurada: ${cotacoes} cotações fictícias. Entre de novo.`);
      setAberto(false);
      qc.clear();
      qc.setQueryData(CHAVE_ME, null);
      // A sessão foi apagada com os dados: volta para o login com o acesso de demonstração.
      navigate('/login', { replace: true });
    },
    onError: (e) => toast.error(e.message),
  });
  const ok = frase.trim().toUpperCase() === FRASE;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="text-quote size-4" />
          Edição de demonstração
        </CardTitle>
        <CardDescription>
          Esta instalação usa só dados fictícios e não tem plano de vigência. Depois de uma
          apresentação, restaure os dados para o estado inicial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          onClick={() => setAberto(true)}
          disabled={!ehAdmin(user)}
          title={ehAdmin(user) ? undefined : 'Somente Admin'}
        >
          <RotateCcw />
          Restaurar demo
        </Button>
      </CardContent>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!v) setFrase('');
          setAberto(v);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="text-destructive size-5" />
              Restaurar a demonstração?
            </DialogTitle>
            <DialogDescription>
              Tudo o que foi feito nesta demo (cotações, clientes, tarifas, configurações e
              usuários) será apagado e os dados de exemplo serão recriados. Você precisará entrar de
              novo com o acesso de demonstração.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="frase-demo">
              Digite <strong>{FRASE}</strong> para confirmar
            </Label>
            <Input
              id="frase-demo"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!ok || restaurar.isPending}
              onClick={() => restaurar.mutate()}
            >
              {restaurar.isPending && <Loader2 className="animate-spin" />}
              Restaurar demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
