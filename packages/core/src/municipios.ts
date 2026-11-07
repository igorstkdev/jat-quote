import { MUNICIPIOS_IBGE } from './data/municipios.js';

/** As 27 unidades da federação. */
export const UFS = Object.freeze({
  AC: 'Acre',
  AL: 'Alagoas',
  AM: 'Amazonas',
  AP: 'Amapá',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MG: 'Minas Gerais',
  MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso',
  PA: 'Pará',
  PB: 'Paraíba',
  PE: 'Pernambuco',
  PI: 'Piauí',
  PR: 'Paraná',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RO: 'Rondônia',
  RR: 'Roraima',
  RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina',
  SE: 'Sergipe',
  SP: 'São Paulo',
  TO: 'Tocantins',
} as const);

export type Uf = keyof typeof UFS;
export const SIGLAS_UF = Object.freeze(Object.keys(UFS) as Uf[]);

export interface Municipio {
  /** Código IBGE (7 dígitos). */
  codigo: number;
  nome: string;
  uf: Uf;
}

interface Indexado extends Municipio {
  chave: string;
}

/** Normaliza para busca: minúsculas, sem acentos, apóstrofos e hífens viram espaço. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let cache: Indexado[] | undefined;
function indice(): Indexado[] {
  cache ??= MUNICIPIOS_IBGE.split('\n').map((linha) => {
    const [codigo, nome, uf] = linha.split(';') as [string, string, Uf];
    return { codigo: Number(codigo), nome, uf, chave: normalizarTexto(nome) };
  });
  return cache;
}

/** Todos os municípios (lista oficial do IBGE). */
export function listarMunicipios(): readonly Municipio[] {
  return indice();
}

export function ehUf(valor: string): valor is Uf {
  return Object.hasOwn(UFS, valor.toUpperCase());
}

/**
 * Busca para o autocompletar. Aceita "feira", "feira de sant", "feira ba", "são paulo sp".
 * Ordem: nome que começa com o termo, depois nome que contém; capitais/nomes curtos primeiro.
 */
export function buscarMunicipios(
  termo: string,
  opcoes: { uf?: string; limite?: number } = {},
): Municipio[] {
  const limite = opcoes.limite ?? 10;
  let t = normalizarTexto(termo);
  let uf = opcoes.uf?.toUpperCase();
  // "feira ba" ou "feira, ba" → UF no fim
  const m = /^(.*?)[ ,]+([a-z]{2})$/.exec(t.replace(/,/g, ' '));
  if (!uf && m && m[1] && ehUf(m[2]!)) {
    t = m[1].trim();
    uf = m[2]!.toUpperCase();
  }
  if (t.length === 0) return [];

  const comeca: Indexado[] = [];
  const contem: Indexado[] = [];
  for (const mun of indice()) {
    if (uf && mun.uf !== uf) continue;
    if (mun.chave.startsWith(t)) comeca.push(mun);
    else if (mun.chave.includes(t)) contem.push(mun);
  }
  const ordenar = (a: Indexado, b: Indexado) =>
    a.nome.length - b.nome.length || a.nome.localeCompare(b.nome, 'pt-BR');
  return [...comeca.sort(ordenar), ...contem.sort(ordenar)]
    .slice(0, limite)
    .map(({ codigo, nome, uf: u }) => ({ codigo, nome, uf: u }));
}

/** Encontra o município exato (ignora maiúsculas/acentos). */
export function encontrarMunicipio(nome: string, uf: string): Municipio | null {
  const chave = normalizarTexto(nome);
  const sigla = uf.toUpperCase();
  const r = indice().find((m) => m.uf === sigla && m.chave === chave);
  return r ? { codigo: r.codigo, nome: r.nome, uf: r.uf } : null;
}

/** "Feira de Santana, BA" */
export function formatarCidade(m: { nome: string; uf: string }): string {
  return `${m.nome}, ${m.uf}`;
}
