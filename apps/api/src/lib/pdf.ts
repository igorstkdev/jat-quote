import { readFileSync } from 'node:fs';
import { formatarCidade, formatarNumeroCotacao } from '@jat/core';
import { chromium, type Browser } from 'playwright-core';
import type { Quote } from '../generated/prisma/client.js';
import { htmlCotacaoCliente, htmlCotacaoOperacao, type DadosPdf } from './pdf-templates.js';
import { resultadoGravado } from './quotes.js';

/** Logo embutida no HTML (o PDF não depende de rede). */
let logo: string | undefined;
function logoDataUrl() {
  logo ??= `data:image/png;base64,${readFileSync(new URL('../../assets/logo-jat.png', import.meta.url)).toString('base64')}`;
  return logo;
}

/** Um Chromium por processo, reaproveitado entre os PDFs. */
let navegador: Promise<Browser> | undefined;
function obterNavegador(): Promise<Browser> {
  navegador ??= chromium.launch({ headless: true }).catch((e: unknown) => {
    navegador = undefined;
    throw new Error(
      `Não foi possível iniciar o Chromium para gerar o PDF. Rode "npx playwright install chromium" no servidor. (${String(e)})`,
    );
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

export async function htmlParaPdf(html: string): Promise<Buffer> {
  const b = await obterNavegador();
  const ctx = await b.newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await ctx.close();
  }
}

type QuoteParaPdf = Quote & { createdBy?: { name: string } | null };

export function dadosPdf(q: QuoteParaPdf, geradoPor: string): DadosPdf {
  return {
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
    resultado: resultadoGravado(q),
    logoDataUrl: logoDataUrl(),
  };
}

export async function gerarPdfCotacao(
  q: QuoteParaPdf,
  visao: 'cliente' | 'operacao',
  geradoPor: string,
): Promise<Buffer> {
  const d = dadosPdf(q, geradoPor);
  return htmlParaPdf(visao === 'operacao' ? htmlCotacaoOperacao(d) : htmlCotacaoCliente(d));
}
