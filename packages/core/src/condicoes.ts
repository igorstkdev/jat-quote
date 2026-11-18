/**
 * Termos e condições das cotações (decisões de 17/11/2026).
 * - Spot: um conjunto por modal (Rodoviário e Aéreo). FTL: um por veículo.
 * - O Admin escolhe o formato de cada conjunto: TÓPICOS (lista com •) ou TEXTO livre.
 * - Ao salvar a cotação, os termos são copiados para ela (não mudam depois).
 */
export const FORMATOS_CONDICOES = ['TOPICOS', 'TEXTO'] as const;
export type FormatoCondicoes = (typeof FORMATOS_CONDICOES)[number];

export interface Condicoes {
  formato: FormatoCondicoes;
  /** Usado quando formato = TOPICOS. */
  topicos: string[];
  /** Usado quando formato = TEXTO. */
  texto: string;
}

export const MAX_TOPICOS = 30;
export const MAX_TAMANHO_TOPICO = 500;
export const MAX_TAMANHO_TEXTO = 5000;

export const condicoesVazias = (formato: FormatoCondicoes = 'TOPICOS'): Condicoes => ({
  formato,
  topicos: [],
  texto: '',
});

/** Tópicos válidos (sem vazios, sem espaços sobrando). */
export function topicosLimpos(c: Pick<Condicoes, 'topicos'>): string[] {
  return c.topicos.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
}

/** Normaliza: tira tópicos vazios e espaços nas pontas do texto. */
export function normalizarCondicoes(c: Condicoes): Condicoes {
  return { formato: c.formato, topicos: topicosLimpos(c), texto: c.texto.trim() };
}

/** Há algo para mostrar no formato escolhido? */
export function temCondicoes(c: Condicoes | null | undefined): c is Condicoes {
  if (!c) return false;
  return c.formato === 'TOPICOS' ? topicosLimpos(c).length > 0 : c.texto.trim() !== '';
}

/** Texto simples (Copiar, e-mail): tópicos viram linhas com "• ". */
export function textoCondicoes(c: Condicoes | null | undefined): string {
  if (!temCondicoes(c)) return '';
  return c.formato === 'TOPICOS'
    ? topicosLimpos(c)
        .map((t) => `• ${t}`)
        .join('\n')
    : c.texto.trim();
}

/** Lê um valor desconhecido (banco/JSON); aceita também o formato antigo (string). */
export function lerCondicoes(v: unknown, padrao: Condicoes = condicoesVazias()): Condicoes {
  if (typeof v === 'string') return { formato: 'TEXTO', topicos: [], texto: v };
  if (!v || typeof v !== 'object') return padrao;
  const o = v as Partial<Condicoes>;
  return {
    formato: o.formato === 'TEXTO' ? 'TEXTO' : 'TOPICOS',
    topicos: Array.isArray(o.topicos) ? o.topicos.filter((t) => typeof t === 'string') : [],
    texto: typeof o.texto === 'string' ? o.texto : '',
  };
}

/** Texto de referência do app atual para o AÉREO (enviado em 17/11/2026). */
export const TOPICOS_AEREO_PADRAO: readonly string[] = Object.freeze([
  'Cotação realizada no modal aéreo, cargas volumosas poderão ter seus pesos corrigidos e o valor recalculado.',
  'ICMS e seguro a incluir.',
  'Em caso de cancelamento do transporte após o acionamento da coleta, haverá cobrança de taxa adicional.',
  'Em caso de coleta ou entrega frustrada, haverá cobrança de taxa adicional.',
  'Horas paradas conforme a legislação em vigor.',
  'A presente cotação está sujeita a alterações no caso de os volumes, peso e dimensões não serem fornecidos corretamente.',
  'A transportadora não se responsabilizará por vazamentos ou sinistros se a presença de óleo no material não for informada.',
]);
