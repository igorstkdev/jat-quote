import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatarCidade, formatarNumeroCotacao, type Condicoes } from '@jat/core';
import { chromium, type Browser } from 'playwright-core';
import type { Quote } from '../generated/prisma/client.js';
import {
  htmlCotacaoCliente,
  htmlCotacaoFtl,
  htmlCotacaoOperacao,
  type DadosPdf,
  type DadosPdfFtl,
  type MarcaPdf,
} from './pdf-templates.js';
import { EMPRESA_DEMO } from './demo.js';
import { HttpError } from './errors.js';
import { resultadoGravado } from './quotes.js';

/** Arquivos das logos usadas no PDF (precisam ir junto no pacote do instalador). */
export const ARQUIVO_LOGO_PDF = new URL('../../assets/logo-jat.png', import.meta.url);
export const ARQUIVO_LOGO_QUOTE_PDF = new URL('../../assets/logo-quote.png', import.meta.url);

export interface MarcaComLogo extends MarcaPdf {
  logo: URL;
}
/** Sistema real (JAT) e edição de demonstração (25/11/2026: só a marca Quote). */
export const MARCA_JAT: MarcaComLogo = {
  empresa: 'JAT Transportes e Logística S/A',
  produto: 'JAT Quote',
  logo: ARQUIVO_LOGO_PDF,
};
export const MARCA_DEMO: MarcaComLogo = {
  empresa: EMPRESA_DEMO,
  produto: 'Quote',
  logo: ARQUIVO_LOGO_QUOTE_PDF,
};

/**
 * Logo embutida no HTML (o PDF não depende de rede). Se o arquivo faltar, o PDF sai SEM logo
 * em vez de falhar (22/11/2026: a falta dele derrubava o PDF com "erro interno").
 */
const logos = new Map<string, string>();
function logoDataUrl(arquivo: URL = ARQUIVO_LOGO_PDF): string {
  let logo = logos.get(arquivo.href);
  if (logo === undefined) {
    try {
      logo = `data:image/png;base64,${readFileSync(arquivo).toString('base64')}`;
    } catch {
      logo = '';
    }
    logos.set(arquivo.href, logo);
  }
  return logo;
}

/** Problemas que impedem ou degradam o PDF (conferidos ao iniciar e no /api/health). */
export function verificarRecursosPdf(): string[] {
  const problemas: string[] = [];
  for (const arquivo of [ARQUIVO_LOGO_PDF, ARQUIVO_LOGO_QUOTE_PDF]) {
    if (!existsSync(arquivo)) {
      problemas.push(`Logo do PDF não encontrada (${fileURLToPath(arquivo)}).`);
    }
  }
  try {
    const exe = chromium.executablePath();
    if (!existsSync(exe)) problemas.push(`Chromium dos PDFs não encontrado (${exe}).`);
  } catch (e) {
    problemas.push(`Chromium dos PDFs não encontrado (${String(e)}).`);
  }
  return problemas;
}

/** Falha ao gerar o PDF: mensagem clara para o usuário (503), e não "erro interno". */
const pdfIndisponivel = (detalhe: string) =>
  new HttpError(
    503,
    `Não foi possível gerar o PDF agora. Tente de novo em instantes; se continuar, avise o responsável pelo sistema. (${detalhe})`,
  );

/** Um Chromium por processo, reaproveitado entre os PDFs; se cair, é reaberto no próximo PDF. */
let navegador: Promise<Browser> | undefined;
function obterNavegador(): Promise<Browser> {
  navegador ??= chromium
    .launch({ headless: true })
    .then((b) => {
      b.on('disconnected', () => {
        navegador = undefined;
      });
      return b;
    })
    .catch((e: unknown) => {
      navegador = undefined;
      throw pdfIndisponivel(`o Chromium não abriu: ${String(e).split('\n')[0]}`);
    });
  return navegador;
}

export async function fecharNavegadorPdf() {
  if (navegador) {
    const b = await navegador.catch(() => null);
    navegador = undefined;
    await b?.close();
  }
}

/** No máximo 2 PDFs ao mesmo tempo (o Chromium usa bastante memória); os outros esperam. */
const MAX_SIMULTANEOS = 2;
let emAndamento = 0;
const fila: (() => void)[] = [];
async function comVaga<T>(fn: () => Promise<T>): Promise<T> {
  if (emAndamento >= MAX_SIMULTANEOS) await new Promise<void>((ok) => fila.push(ok));
  emAndamento++;
  try {
    return await fn();
  } finally {
    emAndamento--;
    fila.shift()?.();
  }
}

/** Tempo máximo de cada etapa do PDF. */
const TEMPO_LIMITE_MS = 30_000;

async function renderizar(html: string): Promise<Buffer> {
  const b = await obterNavegador();
  const ctx = await b.newContext();
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(TEMPO_LIMITE_MS);
    await page.setContent(html, { waitUntil: 'load', timeout: TEMPO_LIMITE_MS });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function htmlParaPdf(html: string): Promise<Buffer> {
  return comVaga(async () => {
    try {
      return await renderizar(html);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      // Chromium caiu ou travou: descarta e tenta uma vez com um novo.
      await fecharNavegadorPdf().catch(() => undefined);
      try {
        return await renderizar(html);
      } catch (e2) {
        if (e2 instanceof HttpError) throw e2;
        throw pdfIndisponivel(String(e2).split('\n')[0] ?? 'falha no Chromium');
      }
    }
  });
}

type QuoteParaPdf = Quote & {
  createdBy?: { name: string } | null;
  ftlRate?: { region: string } | null;
};

export function dadosPdf(
  q: QuoteParaPdf,
  geradoPor: string,
  termos: Condicoes | null,
  marca: MarcaComLogo = MARCA_JAT,
): DadosPdf {
  return {
    marca: { empresa: marca.empresa, produto: marca.produto },
    code: formatarNumeroCotacao(q.number),
    modal: q.modal,
    cliente: q.clientName ?? '—',
    origem:
      q.originCity && q.originUf ? formatarCidade({ nome: q.originCity, uf: q.originUf }) : '—',
    destino: q.destCity && q.destUf ? formatarCidade({ nome: q.destCity, uf: q.destUf }) : '—',
    criadaEm: q.createdAt,
    criadaPor: q.createdBy?.name ?? '—',
    geradoPor,
    geradoEm: new Date(),
    observacoes: q.notes,
    termos,
    resultado: resultadoGravado(q),
    logoDataUrl: logoDataUrl(marca.logo),
  };
}

export function dadosPdfFtl(
  q: QuoteParaPdf,
  geradoPor: string,
  condicoes: Condicoes | null,
  marca: MarcaComLogo = MARCA_JAT,
): DadosPdfFtl {
  return {
    marca: { empresa: marca.empresa, produto: marca.produto },
    code: formatarNumeroCotacao(q.number),
    uf: q.destUf ?? '—',
    regiao: q.ftlRate?.region ?? '',
    localidade: q.ftlLocality ?? 'CAPITAL',
    veiculo: q.vehicle ?? 'VAN',
    distanciaKm: q.distanceKm?.toString() ?? '0',
    tarifaKm: q.ratePerKm?.toString() ?? '0',
    total: q.total.toString(),
    adValoremPct: q.adValoremPct.toString(),
    condicoes,
    criadaEm: q.createdAt,
    geradoPor,
    geradoEm: new Date(),
    observacoes: q.notes,
    logoDataUrl: logoDataUrl(marca.logo),
  };
}

export async function gerarPdfCotacao(
  q: QuoteParaPdf,
  visao: 'cliente' | 'operacao',
  geradoPor: string,
  /** Termos gravados na cotação (ou os atuais, nas cotações antigas). */
  termos: Condicoes | null = null,
  marca: MarcaComLogo = MARCA_JAT,
): Promise<Buffer> {
  if (q.modal === 'FTL') {
    return htmlParaPdf(htmlCotacaoFtl(dadosPdfFtl(q, geradoPor, termos, marca)));
  }
  const d = dadosPdf(q, geradoPor, termos, marca);
  return htmlParaPdf(visao === 'operacao' ? htmlCotacaoOperacao(d) : htmlCotacaoCliente(d));
}
