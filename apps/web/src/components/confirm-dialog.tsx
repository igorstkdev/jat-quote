import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

/** Confirmação para ações destrutivas (CLAUDE.md §5). */
export function ConfirmDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  confirmar,
  onConfirmar,
  destrutivo = true,
  carregando,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  titulo: string;
  descricao: ReactNode;
  confirmar: string;
  onConfirmar: () => void;
  destrutivo?: boolean;
  carregando?: boolean;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={onAbertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{descricao}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={carregando}
            className={buttonVariants({ variant: destrutivo ? 'destructive' : 'default' })}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
          >
            {confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
