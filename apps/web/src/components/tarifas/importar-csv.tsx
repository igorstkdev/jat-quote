import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PencilLine,
  Plus,
  Upload,
  Equal,
  Download,
} from 'lucide-react';
import { escreverCsv } from '@jat/core';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError, type ResultadoImportacao } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Lê o arquivo como UTF-8; se não for UTF-8 válido (Excel no Windows), usa Windows-1252. */
export async function lerArquivoTexto(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Lê o arquivo binário (ex.: .xlsx) em base64. */
async function lerArquivoBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

type TipoArquivo = 'csv' | 'xlsx';

/**
 * Importação em duas etapas: prévia (validação por linha) → confirmar.
 * `tipo="xlsx"`: planilha do Excel, enviada como { file } em base64 (cotações de teste).
 */
export function ImportarCsvDialog({
  aberto,
  onAbertoChange,
  titulo,
  endpoint,
  colunas,
  onImportado,
  tipo = 'csv',
  descricao,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  titulo: string;
  endpoint: string;
  colunas: string;
  onImportado: () => void;
  tipo?: TipoArquivo;
  descricao?: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-2xl">
        {aberto && (
          <Conteudo
            titulo={titulo}
            endpoint={endpoint}
            colunas={colunas}
            onFechar={() => onAbertoChange(false)}
            onImportado={onImportado}
            tipo={tipo}
            descricao={descricao}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  titulo,
  endpoint,
  colunas,
  onFechar,
  onImportado,
  tipo,
  descricao,
}: {
  titulo: string;
  endpoint: string;
  colunas: string;
  onFechar: () => void;
  onImportado: () => void;
  tipo: TipoArquivo;
  descricao?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<{ nome: string; csv: string } | null>(null);
  const corpo = (conteudo: string) => (tipo === 'xlsx' ? { file: conteudo } : { csv: conteudo });

  const previa = useMutation({
    mutationFn: (conteudo: string) => api.post<ResultadoImportacao>(endpoint, corpo(conteudo)),
  });
  const confirmar = useMutation({
    mutationFn: () =>
      api.post<ResultadoImportacao>(endpoint, { ...corpo(arquivo!.csv), confirm: true }),
    onSuccess: (r) => {
      if (!r.applied) {
        toast.error('O arquivo mudou ou tem erros. Revise a prévia.');
        return;
      }
      const { criar, atualizar } = r.summary;
      toast.success(`Importação concluída: ${criar} novas e ${atualizar} atualizadas.`);
      onImportado();
      onFechar();
    },
    onError: (e) => toast.error(e.message),
  });

  const escolher = async (f: File | undefined) => {
    if (!f) return;
    const csv = tipo === 'xlsx' ? await lerArquivoBase64(f) : await lerArquivoTexto(f);
    setArquivo({ nome: f.name, csv });
    previa.mutate(csv);
  };

  const r = previa.data;
  const erros = r?.rows.filter((l) => l.acao === 'erro') ?? [];
  const aplicaveis = r ? r.summary.criar + r.summary.atualizar : 0;

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>
          {descricao ??
            'Use o mesmo layout do arquivo exportado (separado por ponto e vírgula ou vírgula). Nada é gravado antes da sua confirmação.'}
        </DialogDescription>
      </DialogHeader>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void escolher(e.dataTransfer.files[0]);
        }}
        className="hover:border-primary/50 hover:bg-primary/4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors"
      >
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
          {arquivo ? <FileSpreadsheet className="size-5" /> : <Upload className="size-5" />}
        </span>
        <span className="text-sm font-medium">
          {arquivo ? arquivo.nome : `Escolha ou arraste o arquivo .${tipo}`}
        </span>
        <span className="text-muted-foreground max-w-md text-xs break-words">
          Colunas: {colunas}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={
          tipo === 'xlsx'
            ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : '.csv,text/csv'
        }
        className="hidden"
        aria-label={tipo === 'xlsx' ? 'Planilha do Excel' : 'Arquivo CSV'}
        onChange={(e) => {
          void escolher(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {previa.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Validando o arquivo…
        </div>
      )}
      {previa.error && (
        <FormError
          mensagem={previa.error instanceof ApiError ? previa.error.message : 'Falha ao validar.'}
        />
      )}

      {r && (
        <div className="grid gap-4" data-testid="previa-importacao">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Resumo icone={Plus} rotulo="Novas" valor={r.summary.criar} cor="text-primary" />
            <Resumo
              icone={PencilLine}
              rotulo="Atualizadas"
              valor={r.summary.atualizar}
              cor="text-status-declinada"
            />
            <Resumo
              icone={Equal}
              rotulo="Sem alteração"
              valor={r.summary.igual}
              cor="text-muted-foreground"
            />
            <Resumo
              icone={AlertCircle}
              rotulo="Com erro"
              valor={r.summary.erros}
              cor={r.summary.erros ? 'text-destructive' : 'text-muted-foreground'}
            />
          </div>
          {erros.length > 0 ? (
            <div className="border-destructive/30 max-h-56 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-destructive/6 sticky top-0 text-left">
                  <tr>
                    <th className="w-16 px-3 py-2 font-medium">Linha</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Problema</th>
                  </tr>
                </thead>
                <tbody>
                  {erros.map((e) => (
                    <tr key={e.linha} className="border-t">
                      <td className="tabular px-3 py-2">{e.linha}</td>
                      <td className="max-w-40 truncate px-3 py-2" title={e.rota}>
                        {e.rota ?? '—'}
                      </td>
                      <td className="text-destructive px-3 py-2">{e.erro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : r.summary.total === 0 ? (
            <FormError mensagem="O arquivo não tem linhas de dados." />
          ) : (
            <div className="text-status-aprovada flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" />
              {aplicaveis === 0
                ? 'Tudo igual ao que já está cadastrado. Nada a importar.'
                : 'Arquivo válido. Confira os números e confirme.'}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {erros.length > 0
                ? 'Corrija as linhas no arquivo e escolha-o de novo. Com erro, nada é importado.'
                : 'O relatório lista o que acontecerá com cada linha.'}
            </p>
            {r.summary.total > 0 && arquivo && (
              <Button variant="outline" size="sm" onClick={() => baixarRelatorio(r, arquivo.nome)}>
                <Download /> Baixar relatório
              </Button>
            )}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          onClick={() => confirmar.mutate()}
          disabled={!r || erros.length > 0 || aplicaveis === 0 || confirmar.isPending}
        >
          {confirmar.isPending && <Loader2 className="animate-spin" />}
          {aplicaveis > 0
            ? `Importar ${aplicaveis} ${aplicaveis === 1 ? 'linha' : 'linhas'}`
            : 'Importar'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Resumo({
  icone: Icone,
  rotulo,
  valor,
  cor,
}: {
  icone: typeof Plus;
  rotulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg border px-3 py-2.5">
      <div className={cn('flex items-center gap-1.5 text-xs font-medium', cor)}>
        <Icone className="size-3.5" />
        {rotulo}
      </div>
      <div className="tabular mt-0.5 text-xl font-semibold">{valor}</div>
    </div>
  );
}

const ROTULO_ACAO = {
  criar: 'Novo',
  atualizar: 'Atualiza',
  igual: 'Sem alteração',
  erro: 'Erro',
} as const;

/** Relatório de inconsistências da importação (CSV para abrir no Excel), linha a linha. */
function baixarRelatorio(r: ResultadoImportacao, nomeArquivo: string) {
  const ordem = { erro: 0, criar: 1, atualizar: 2, igual: 3 } as const;
  const linhas = [...r.rows].sort((a, b) => ordem[a.acao] - ordem[b.acao] || a.linha - b.linha);
  const csv = escreverCsv([
    ['Linha do arquivo', 'Item', 'Resultado', 'Problema'],
    ...linhas.map((l) => [l.linha, l.rota ?? '', ROTULO_ACAO[l.acao], l.erro ?? '']),
  ]);
  const bom = String.fromCharCode(0xfeff); // o Excel precisa dele para mostrar os acentos
  const url = URL.createObjectURL(new Blob([bom + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-importacao_${nomeArquivo.replace(/\.(csv|xlsx)$/i, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
