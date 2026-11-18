import { chaveCabecalho, encontrarMunicipio, parseNumero, type Condicoes } from '@jat/core';
import ExcelJS from 'exceljs';
import type { Modal, QuoteStatus } from '../generated/prisma/client.js';

/**
 * Importação de cotações da planilha exportada (17/11/2026) como DADOS DE TESTE.
 * Colunas: Nº; DATA; CLIENTE; ROTA; MODAL; TOTAL; STATUS; Criada por (esta é ignorada).
 * A planilha só traz o total: a cotação entra com custo = total, sem markup e sem pedágio.
 */
export const COLUNAS_IMPORTACAO = ['Nº', 'DATA', 'CLIENTE', 'ROTA', 'MODAL', 'TOTAL', 'STATUS'];

export interface LinhaImportada {
  linha: number;
  numero: number;
  data: Date;
  cliente: string;
  origem: { nome: string; uf: string };
  destino: { nome: string; uf: string };
  modal: Extract<Modal, 'AEREO' | 'RODOVIARIO'>;
  total: string;
  status: QuoteStatus;
}

export interface ErroLinha {
  linha: number;
  item: string;
  erro: string;
}

const STATUS: Record<string, QuoteStatus> = {
  pendente: 'PENDENTE',
  aprovada: 'APROVADA',
  declinada: 'DECLINADA',
  recusada: 'RECUSADA',
};
const MODAIS: Record<string, LinhaImportada['modal']> = {
  aereo: 'AEREO',
  rodoviario: 'RODOVIARIO',
};

/** Valor da célula como texto (resolve fórmulas, rich text e hiperlinks). */
function texto(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
  }
  return String(v).trim();
}

/**
 * Data da célula. O Excel não guarda fuso: 17/11/2025 20:26 vem como 20:26 "UTC", que é
 * a hora de Brasília (UTC−3, sem horário de verão desde 2019).
 */
function lerDataCelula(v: ExcelJS.CellValue): Date | null {
  if (v && typeof v === 'object' && 'result' in v)
    return lerDataCelula(v.result as ExcelJS.CellValue);
  if (v instanceof Date) return new Date(v.getTime() + 3 * 3600_000);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(texto(v));
  if (!m) return null;
  const [, d, mes, a, h = '12', min = '00'] = m;
  const dt = new Date(
    `${a}-${mes!.padStart(2, '0')}-${d!.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:00-03:00`,
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "Cidade, UF" → cidade oficial do IBGE (sem diferenciar acentos) ou o texto como veio. */
function lerCidade(s: string): { nome: string; uf: string } | null {
  const i = s.lastIndexOf(',');
  if (i <= 0) return null;
  const nome = s.slice(0, i).trim();
  const uf = s
    .slice(i + 1)
    .trim()
    .toUpperCase();
  if (!nome || !/^[A-Z]{2}$/.test(uf)) return null;
  const m = encontrarMunicipio(nome, uf);
  return m ? { nome: m.nome, uf: m.uf } : { nome, uf };
}

/** Lê a planilha (.xlsx em base64). Erros por linha não interrompem a leitura. */
export async function lerPlanilhaCotacoes(base64: string) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      'Não foi possível ler o arquivo. Envie a planilha .xlsx exportada do relatório.',
    );
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha está vazia.');

  const cab = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => cab.set(chaveCabecalho(texto(c.value)), col));
  const faltam = COLUNAS_IMPORTACAO.filter((c) => !cab.has(chaveCabecalho(c)));
  if (faltam.length) {
    throw new Error(
      `A planilha não está no formato esperado. Coluna ausente: ${faltam.join(', ')}.`,
    );
  }
  const col = (r: ExcelJS.Row, nome: string) => r.getCell(cab.get(chaveCabecalho(nome))!).value;

  const linhas: LinhaImportada[] = [];
  const erros: ErroLinha[] = [];
  let total = 0;
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const vals = COLUNAS_IMPORTACAO.map((c) => texto(col(r, c)));
    if (vals.every((v) => v === '')) return;
    total++;
    const item = `${vals[0] || '—'} — ${vals[2] || 'sem cliente'}`;
    const erro = (e: string) => erros.push({ linha: n, item, erro: e });

    const num = /^(?:JQ-?)?0*(\d{1,9})$/i.exec(vals[0]!);
    if (!num) return erro(`Nº "${vals[0]}" inválido (use JQ-000123).`);
    const data = lerDataCelula(col(r, 'DATA'));
    if (!data) return erro(`DATA "${vals[1]}" inválida.`);
    const cliente = vals[2]!.replace(/\s+/g, ' ');
    if (!cliente) return erro('CLIENTE vazio.');
    if (cliente.length > 120) return erro('CLIENTE com mais de 120 caracteres.');
    const partes = vals[3]!.split(/\s*(?:→|->)\s*/);
    const origem = partes.length === 2 ? lerCidade(partes[0]!) : null;
    const destino = partes.length === 2 ? lerCidade(partes[1]!) : null;
    if (!origem || !destino)
      return erro(`ROTA "${vals[3]}" inválida (use "Cidade, UF → Cidade, UF").`);
    const modal = MODAIS[chaveCabecalho(vals[4]!)];
    if (!modal) return erro(`MODAL "${vals[4]}" inválido: use Aéreo ou Rodoviário.`);
    let valor;
    try {
      const v = col(r, 'TOTAL');
      valor = parseNumero(typeof v === 'number' ? v : vals[5]!, 'total', 'TOTAL');
    } catch {
      valor = null;
    }
    if (!valor || valor.lte(0)) return erro(`TOTAL "${vals[5]}" inválido.`);
    const status = STATUS[chaveCabecalho(vals[6]!)];
    if (!status) return erro(`STATUS "${vals[6]}" inválido.`);

    linhas.push({
      linha: n,
      numero: Number(num[1]),
      data,
      cliente,
      origem,
      destino,
      modal,
      total: valor.toFixed(2),
      status,
    });
  });
  return { linhas, erros, total };
}

/** Campos da cotação importada (custo = total; sem markup e sem pedágio). */
export function dadosCotacaoImportada(
  l: LinhaImportada,
  extra: { clientId: string; clientName: string; adValoremPct: string; termos: Condicoes },
) {
  return {
    number: l.numero,
    modal: l.modal,
    status: l.status,
    clientId: extra.clientId,
    clientName: extra.clientName,
    originCity: l.origem.nome,
    originUf: l.origem.uf,
    destCity: l.destino.nome,
    destUf: l.destino.uf,
    costRoad: l.modal === 'RODOVIARIO' ? l.total : null,
    costAir: l.modal === 'AEREO' ? l.total : null,
    toll: '0',
    markupPct: '0',
    adValoremPct: extra.adValoremPct,
    costTotal: l.total,
    markupTotal: '0',
    subtotal: l.total,
    total: l.total,
    terms: extra.termos as never,
    isTestData: true,
    createdAt: l.data,
    updatedAt: l.data,
  };
}
