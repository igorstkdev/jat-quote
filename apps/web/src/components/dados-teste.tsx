import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Loader2, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImportarCsvDialog } from '@/components/tarifas/importar-csv';
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

const FRASE = 'REMOVER DADOS DE TESTE';
const CHAVE = ['quotes', 'test-data'] as const;

/**
 * Cotações de teste (17/11/2026, só Admin): importar a planilha exportada e remover em lote
 * as que foram importadas. As cotações reais nunca são tocadas.
 */
export function AcoesDadosTeste({ onAlterado }: { onAlterado: () => void }) {
  const qc = useQueryClient();
  const [importar, setImportar] = useState(false);
  const [remover, setRemover] = useState(false);
  const qtd = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.get<{ count: number }>('/api/quotes/test-data'),
  });
  const n = qtd.data?.count ?? 0;
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: CHAVE });
    onAlterado();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setImportar(true)}>
        <Upload />
        Importar cotações (Excel)
      </Button>
      {n > 0 && (
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setRemover(true)}
        >
          <Trash2 />
          Remover dados de teste ({n})
        </Button>
      )}

      <ImportarCsvDialog
        aberto={importar}
        onAbertoChange={setImportar}
        titulo="Importar cotações de teste (Excel)"
        tipo="xlsx"
        endpoint="/api/quotes/import"
        colunas="Nº; DATA; CLIENTE; ROTA; MODAL; TOTAL; STATUS"
        descricao="Planilha exportada do relatório. Entram como dados de teste (custo = total, sem markup e sem pedágio), com o número JQ, a data e o status da planilha. Clientes que não existem são criados. Nada é gravado antes da sua confirmação."
        onImportado={atualizar}
      />
      <RemoverDialog
        aberto={remover}
        onAbertoChange={setRemover}
        quantidade={n}
        onConcluido={atualizar}
      />
    </>
  );
}

function RemoverDialog({
  aberto,
  onAbertoChange,
  quantidade,
  onConcluido,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  quantidade: number;
  onConcluido: () => void;
}) {
  const [frase, setFrase] = useState('');
  const remover = useMutation({
    mutationFn: () =>
      api.post<{ removed: number }>('/api/quotes/test-data/remove', { confirmation: frase }),
    onSuccess: ({ removed }) => {
      toast.success(`${removed} cotações de teste removidas.`);
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
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" />
            Remover os dados de teste?
          </DialogTitle>
          <DialogDescription>
            Apaga de vez as <strong>{quantidade}</strong> cotações importadas como teste e o
            histórico de status delas. As cotações feitas no sistema não são tocadas, e os clientes
            criados na importação continuam cadastrados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="frase-teste">
            Digite <strong>{FRASE}</strong> para confirmar
          </Label>
          <Input
            id="frase-teste"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!ok || remover.isPending}
            onClick={() => remover.mutate()}
          >
            {remover.isPending && <Loader2 className="animate-spin" />}
            Remover dados de teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Selo discreto na linha da cotação importada como teste. */
export function SeloTeste() {
  return (
    <span
      title="Cotação importada como dado de teste"
      className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
    >
      <FlaskConical className="size-3" />
      teste
    </span>
  );
}
