/**
 * CSV no padrão do app atual (Base44): separador `;`, campos com aspas quando
 * necessário. Funções puras, usadas na importação e na exportação das tarifas.
 */

export const SEPARADOR_CSV = ';';

/** Lê um CSV inteiro: aceita BOM, CRLF/LF, aspas e aspas duplicadas (""). Ignora linhas vazias. */
export function lerCsv(texto: string, sep = SEPARADOR_CSV): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;

  const fecharLinha = () => {
    linha.push(campo);
    campo = '';
    if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
    linha = [];
  };

  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fecharLinha();
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length > 0) fecharLinha();
  return linhas;
}

function celula(v: string | number | null | undefined, sep: string): string {
  const s = v == null ? '' : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monta o CSV (CRLF, para abrir bem no Excel). O BOM fica a cargo de quem grava o arquivo. */
export function escreverCsv(
  linhas: readonly (readonly (string | number | null | undefined)[])[],
  sep = SEPARADOR_CSV,
): string {
  return linhas.map((l) => l.map((v) => celula(v, sep)).join(sep)).join('\r\n') + '\r\n';
}

/** Compara cabeçalhos sem acento, caixa ou espaços extras ("Vigência Início" = "vigencia inicio"). */
export function chaveCabecalho(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
