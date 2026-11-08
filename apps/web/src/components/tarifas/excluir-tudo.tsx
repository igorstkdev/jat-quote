import { useMutation } from '@tanstack/react-query';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { api } from '@/lib/api';

const FRASE = 'EXCLUIR TUDO';

/** "Excluir Tudo" (somente Admin): arquiva tudo após digitar a frase de confirmação. */
export function ExcluirTudoDialog({
  aberto,
  onAbertoChange,
  endpoint,
  quantidade,
  oQue,
  onConcluido,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  endpoint: string;
  quantidade: number;
  /** Ex.: "tarifas aéreas" */
  oQue: string;
  onConcluido: () => void;
}) {
  const [frase, setFrase] = useState('');
  const excluir = useMutation({
    mutationFn: () => api.post<{ archived: number }>(endpoint, { confirmation: frase }),
    onSuccess: ({ archived }) => {
      toast.success(
        `${archived} ${oQue} arquivadas. O histórico continua disponível na auditoria.`,
      );
      setFrase('');
      onAbertoChange(false);
      onConcluido();
    },
    onError: (e) => toast.error(e.message),
  });
  const ok = frase.trim().toUpperCase() === FRASE;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) setFrase('');
        onAbertoChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-destructive/10 text-destructive mb-1 flex size-10 items-center justify-center rounded-lg">
            <TriangleAlert className="size-5" />
          </div>
          <DialogTitle>Excluir todas as {oQue}?</DialogTitle>
          <DialogDescription>
            As <strong className="text-foreground">{quantidade}</strong> {oQue} sairão das telas e
            das calculadoras. Elas ficam arquivadas no banco, com histórico e auditoria, mas não
            voltam pela tela.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) excluir.mutate();
          }}
        >
          <Label htmlFor="frase-excluir">
            Para confirmar, digite <span className="font-mono font-semibold">{FRASE}</span>
          </Label>
          <Input
            id="frase-excluir"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <DialogFooter className="mt-3">
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!ok || excluir.isPending}>
              {excluir.isPending && <Loader2 className="animate-spin" />}
              Excluir tudo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
