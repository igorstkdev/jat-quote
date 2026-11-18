import {
  dataValidade,
  destinoFtl,
  formatNumero,
  ROTULO_VEICULO,
  type VeiculoFtl,
  formatarDataBR,
  formatBRL,
  formatPercentual,
  ROTULO_MODAL,
  VALIDADE_COTACAO_DIAS,
  topicosLimpos,
  temCondicoes,
  type Condicoes,
  type ResultadoSpot,
} from '@jat/core';

export interface DadosPdf {
  code: string;
  modal: 'AEREO' | 'RODOVIARIO' | 'FTL';
  cliente: string;
  origem: string;
  destino: string;
  criadaEm: Date;
  criadaPor: string;
  geradoPor: string;
  geradoEm: Date;
  observacoes: string | null;
  /** Termos e condições do modal (17/11/2026). */
  termos: Condicoes | null;
  resultado: ResultadoSpot;
  logoDataUrl: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});
const dataHora = (d: Date) => `${formatarDataBR(d)} às ${fmtHora.format(d)}`;

const ROTULO_PDF: Record<string, string> = {
  RODOVIARIO: 'Transporte rodoviário',
  COLETA: 'Coleta',
  AEREO: 'Transporte aéreo',
  ENTREGA: 'Entrega',
};

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 11pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { width: 210mm; min-height: 297mm; padding: 16mm 16mm 22mm; position: relative; }
  .faixa { position: absolute; top: 0; left: 0; right: 0; height: 5mm; background: #1F428A; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 4mm;
    padding-bottom: 6mm; border-bottom: 1px solid #e2e8f0; }
  header img { height: 15mm; }
  .titulo { text-align: right; }
  .titulo .tipo { font-size: 9pt; letter-spacing: .12em; color: #64748b; font-weight: 600; text-transform: uppercase; }
  .titulo .num { font-size: 20pt; font-weight: 700; color: #1F428A; margin-top: 1mm; font-variant-numeric: tabular-nums; }
  .titulo .data { font-size: 9pt; color: #64748b; margin-top: 1mm; }
  .selo { display: inline-block; margin-top: 2mm; padding: 1mm 3mm; border-radius: 99px; background: #fef3c7;
    color: #92400e; font-size: 8pt; font-weight: 700; letter-spacing: .06em; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 7mm; }
  .campo { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3.5mm 4mm; }
  .campo .rot { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
  .campo .val { font-size: 11.5pt; font-weight: 600; margin-top: 1mm; }
  .largo { grid-column: span 2; }
  .rota { display: flex; align-items: center; gap: 3mm; }
  .rota .seta { color: #f97316; font-weight: 700; }
  .total { margin-top: 8mm; border-radius: 4mm; padding: 7mm 8mm; background: #1F428A; color: #fff;
    display: flex; justify-content: space-between; align-items: center; }
  .total .rot { font-size: 10pt; opacity: .85; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; }
  .total .val { font-size: 26pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .1em; color: #475569; margin: 9mm 0 3mm; }
  ul.cond { margin: 0; padding-left: 5mm; line-height: 1.6; }
  ul.termos { margin: 0; padding-left: 5mm; line-height: 1.5; font-size: 9.5pt; color: #334155; }
  ul.termos li { margin-bottom: .8mm; }
  .termos-texto { white-space: pre-wrap; font-size: 9.5pt; line-height: 1.5; color: #334155; }
  .obs { white-space: pre-wrap; background: #f8fafc; border-left: 3px solid #1F428A; padding: 3mm 4mm; border-radius: 1mm; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td { padding: 2mm 0; }
  td.v { text-align: right; white-space: nowrap; }
  .comps { display: grid; gap: 3mm; }
  .comps.n3 { grid-template-columns: repeat(3, 1fr); font-size: 9.5pt; }
  .comps.n3 td.v { padding-left: 2mm; }
  .comp { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3mm 3.5mm; }
  .grade.compacta { grid-template-columns: 2fr 1fr 1fr; margin-top: 6mm; }
  .grade.compacta .largo { grid-column: span 3; }
  .total.menor { margin-top: 6mm; padding: 5mm 7mm; }
  .total.menor .val { font-size: 22pt; }
  .op h2 { margin: 6mm 0 2.5mm; }
  .comp .nome { font-weight: 700; text-transform: uppercase; font-size: 9.5pt; letter-spacing: .05em; color: #1F428A; }
  .comp td { padding: 1mm 0; color: #334155; }
  .comp tr.t td { color: #0f172a; font-weight: 700; border-top: 1px dashed #cbd5e1; padding-top: 1.5mm; }
  .resumo td { border-bottom: 1px solid #f1f5f9; }
  .resumo tr.mk td { color: #4338ca; font-weight: 600; }
  footer { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; font-size: 8pt; color: #94a3b8;
    display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 3mm; }
`;

function cabecalho(
  d: Pick<DadosPdf, 'logoDataUrl' | 'code' | 'criadaEm'>,
  tipo: string,
  selo?: string,
) {
  return `
    <div class="faixa"></div>
    <header>
      <img src="${d.logoDataUrl}" alt="Grupo JAT" />
      <div class="titulo">
        <div class="tipo">${esc(tipo)}</div>
        <div class="num">${esc(d.code)}</div>
        <div class="data">Emitida em ${dataHora(d.criadaEm)}</div>
        ${selo ? `<div class="selo">${esc(selo)}</div>` : ''}
      </div>
    </header>`;
}

function rodape(d: DadosPdf) {
  return `<footer><span>JAT Transportes e Logística S/A</span><span>Gerado pelo JAT Quote em ${dataHora(d.geradoEm)} por ${esc(d.geradoPor)}</span></footer>`;
}

function infos(d: DadosPdf, extras = '') {
  return `
    <div class="grade">
      <div class="campo largo"><div class="rot">Cliente</div><div class="val">${esc(d.cliente)}</div></div>
      <div class="campo largo"><div class="rot">Rota</div>
        <div class="val rota">${esc(d.origem)} <span class="seta">→</span> ${esc(d.destino)}</div></div>
      <div class="campo"><div class="rot">Modal</div><div class="val">${esc(ROTULO_MODAL[d.modal])}</div></div>
      ${extras}
    </div>`;
}

function infosCompactas(d: DadosPdf) {
  return `
    <div class="grade compacta">
      <div class="campo largo"><div class="rot">Cliente</div><div class="val">${esc(d.cliente)}</div></div>
      <div class="campo"><div class="rot">Rota</div>
        <div class="val rota">${esc(d.origem)} <span class="seta">→</span> ${esc(d.destino)}</div></div>
      <div class="campo"><div class="rot">Modal</div><div class="val">${esc(ROTULO_MODAL[d.modal])}</div></div>
      <div class="campo"><div class="rot">Criada por</div><div class="val">${esc(d.criadaPor)}</div></div>
    </div>`;
}

/** Bloco de termos e condições: lista (tópicos) ou texto livre. Vazio = nada. */
function blocoTermos(c: Condicoes | null, titulo = 'Termos e condições') {
  if (!temCondicoes(c)) return '';
  const corpo =
    c.formato === 'TOPICOS'
      ? `<ul class="termos">${topicosLimpos(c)
          .map((t) => `<li>${esc(t)}</li>`)
          .join('')}</ul>`
      : `<div class="termos-texto">${esc(c.texto.trim())}</div>`;
  return `<h2>${esc(titulo)}</h2>${corpo}`;
}

function documento(corpo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body><div class="pagina">${corpo}</div></body></html>`;
}

/** PDF para o CLIENTE: sem custos internos, com condições e validade. */
export function htmlCotacaoCliente(d: DadosPdf): string {
  const r = d.resultado;
  const validade = formatarDataBR(dataValidade(d.criadaEm));
  return documento(`
    ${cabecalho(d, 'Cotação de frete')}
    ${infos(d, `<div class="campo"><div class="rot">Validade</div><div class="val">${VALIDADE_COTACAO_DIAS} dias (até ${validade})</div></div>`)}
    <div class="total"><div class="rot">Valor do frete</div><div class="val">${formatBRL(r.total)}</div></div>
    <h2>Condições comerciais</h2>
    <ul class="cond">
      <li>${esc(r.adValorem.condicao)}</li>
      <li>Validade da cotação: ${VALIDADE_COTACAO_DIAS} dias, até ${validade}.</li>
    </ul>
    ${blocoTermos(d.termos)}
    ${d.observacoes ? `<h2>Observações</h2><div class="obs">${esc(d.observacoes)}</div>` : ''}
    </div>
    ${rodape(d)}
  `);
}

/** PDF da OPERAÇÃO (uso interno): detalhamento dos custos, como o app atual. */
export function htmlCotacaoOperacao(d: DadosPdf): string {
  const r = d.resultado;
  const pct = formatPercentual(r.markupPct).replace(/,00%$/, '%');
  const comps = r.componentes
    .map(
      (c) => `
      <div class="comp">
        <div class="nome">${esc(ROTULO_PDF[c.componente] ?? c.rotulo)}</div>
        <table>
          <tr><td>Custo base</td><td class="v">${formatBRL(c.custo)}</td></tr>
          <tr><td>+ MKUP (${pct})</td><td class="v">${formatBRL(c.comMarkup.minus(c.custo))}</td></tr>
          <tr class="t"><td>Total com MKUP</td><td class="v">${formatBRL(c.comMarkup)}</td></tr>
        </table>
      </div>`,
    )
    .join('');
  const est = r.adValorem.estimativa
    ? ` Estimativa sobre ${formatBRL(r.adValorem.valorMercadoria!)}: ${formatBRL(r.adValorem.estimativa)} (fora do total).`
    : '';
  return documento(`
    <div class="op">
    ${cabecalho(d, 'Cotação de frete', 'VISÃO OPERAÇÃO · USO INTERNO')}
    ${infosCompactas(d)}
    <h2>Detalhamento dos custos (MKUP individual)</h2>
    <div class="comps ${r.componentes.length === 3 ? 'n3' : ''}">${comps}</div>
    <table class="resumo">
      <tr class="mk"><td>MKUP total aplicado</td><td class="v">${formatBRL(r.markupTotal)}</td></tr>
      <tr><td>Subtotal com MKUP</td><td class="v">${formatBRL(r.subtotal)}</td></tr>
      <tr><td>Pedágio</td><td class="v">${formatBRL(r.pedagio)}</td></tr>
    </table>
    <div class="total menor"><div class="rot">Total do frete</div><div class="val">${formatBRL(r.total)}</div></div>
    <h2>Ad valorem (informativo)</h2>
    <ul class="cond"><li>${esc(r.adValorem.condicao)}${esc(est)}</li></ul>
    ${blocoTermos(d.termos)}
    ${d.observacoes ? `<h2>Observações</h2><div class="obs">${esc(d.observacoes)}</div>` : ''}
    ${rodape(d)}
  `);
}

export interface DadosPdfFtl {
  code: string;
  uf: string;
  regiao: string;
  localidade: 'CAPITAL' | 'INTERIOR';
  veiculo: VeiculoFtl;
  distanciaKm: string;
  tarifaKm: string;
  total: string;
  adValoremPct: string;
  /** Condições comerciais do veículo (gravadas na cotação). */
  condicoes: Condicoes | null;
  criadaEm: Date;
  geradoPor: string;
  geradoEm: Date;
  observacoes: string | null;
  logoDataUrl: string;
}

/** PDF da cotação FTL Fiat (sem cliente; condições comerciais do Admin). */
export function htmlCotacaoFtl(d: DadosPdfFtl): string {
  const campo = (rot: string, val: string, extra = '') =>
    `<div class="campo ${extra}"><div class="rot">${esc(rot)}</div><div class="val">${esc(val)}</div></div>`;
  return documento(`
    ${cabecalho(d, 'Cotação FTL Fiat')}
    <div class="grade">
      ${campo('Destino', destinoFtl(d), 'largo')}
      ${campo('Veículo', ROTULO_VEICULO[d.veiculo])}
      ${campo('KM da rota', `${formatNumero(d.distanciaKm, 0, 2)} km`)}
      ${campo('Tarifa por km', formatBRL(d.tarifaKm))}
      ${campo('Ad valorem', `${formatPercentual(d.adValoremPct)} sobre a nota fiscal (cobrado adicionalmente)`)}
    </div>
    <div class="total"><div class="rot">Valor do frete</div><div class="val">${formatBRL(d.total)}</div></div>
    ${blocoTermos(d.condicoes, 'Condições comerciais')}
    ${d.observacoes ? `<h2>Observações</h2><div class="obs">${esc(d.observacoes)}</div>` : ''}
    <footer><span>JAT Transportes e Logística S/A</span><span>Gerado pelo JAT Quote em ${dataHora(d.geradoEm)} por ${esc(d.geradoPor)}</span></footer>
  `);
}
