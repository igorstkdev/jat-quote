import { ErroValidacao } from './erros.js';

/** Data "pura" no formato ISO (aaaa-mm-dd), sem hora nem fuso. */
export type DataIso = string;

const fmtIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia de hoje (ou de `agora`) no fuso de São Paulo, como aaaa-mm-dd. */
export function hojeIso(agora: Date = new Date()): DataIso {
  return fmtIso.format(agora);
}

function valida(a: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Lê uma data em dd/mm/aaaa (também aceita aaaa-mm-dd). Vazio → null.
 * Data inexistente (31/02) gera erro de validação.
 */
export function lerData(
  texto: string | null | undefined,
  campo = 'data',
  rotulo = 'Data',
): DataIso | null {
  const s = (texto ?? '').trim();
  if (s === '') return null;
  let a: number, m: number, d: number;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s);
  if (br) {
    [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else if (iso) {
    [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    throw new ErroValidacao(campo, `${rotulo}: use o formato dd/mm/aaaa.`);
  }
  if (!valida(a, m, d)) throw new ErroValidacao(campo, `${rotulo}: data inválida (${s}).`);
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** aaaa-mm-dd → dd/mm/aaaa */
export function dataIsoParaBR(iso: DataIso): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export interface Vigencia {
  inicio: DataIso;
  /** null = sem data final (vale até ser substituída). */
  fim: DataIso | null;
}

/** Valida a vigência: início obrigatório e fim (se houver) não anterior ao início. */
export function validarVigencia(v: { inicio: DataIso | null; fim: DataIso | null }): Vigencia {
  if (!v.inicio) throw new ErroValidacao('validFrom', 'Informe o início da vigência.');
  if (v.fim && v.fim < v.inicio) {
    throw new ErroValidacao('validTo', 'O fim da vigência não pode ser antes do início.');
  }
  return { inicio: v.inicio, fim: v.fim };
}

/** Duas vigências se sobrepõem se compartilham ao menos um dia (datas inclusivas). */
export function vigenciasSobrepostas(a: Vigencia, b: Vigencia): boolean {
  const aAntesDeB = a.fim !== null && a.fim < b.inicio;
  const bAntesDeA = b.fim !== null && b.fim < a.inicio;
  return !aAntesDeB && !bAntesDeA;
}

/** A vigência cobre o dia informado? */
export function vigenteEm(v: Vigencia, dia: DataIso): boolean {
  return v.inicio <= dia && (v.fim === null || v.fim >= dia);
}
