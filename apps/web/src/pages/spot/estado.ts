import { ErroValidacao, formatNumero, type ResultadoSpot, calcularSpot } from '@jat/core';
import type { Cidade } from '@/components/city-combobox';
import type { ClienteSel } from '@/components/client-combobox';
import type { ComponenteSpot, Configuracoes, Cotacao } from '@/lib/api';

export type ModalSpot = 'AEREO' | 'RODOVIARIO';

export interface FormSpot {
  cliente: ClienteSel | null;
  origem: Cidade | null;
  destino: Cidade | null;
  modal: ModalSpot;
  custos: Record<ComponenteSpot, string>;
  pedagio: string;
  markup: string;
  /** Vazio = padrão do modal. */
  adValorem: string;
  mercadoria: string;
  obs: string;
}

export const FORM_VAZIO: FormSpot = {
  cliente: null,
  origem: null,
  destino: null,
  modal: 'RODOVIARIO',
  custos: { RODOVIARIO: '', COLETA: '', AEREO: '', ENTREGA: '' },
  pedagio: '',
  markup: '',
  adValorem: '',
  mercadoria: '',
  obs: '',
};

/** Valores decimais da API ("1935", "0.47") → texto do formulário ("1.935,00", "0,47"). */
const dinheiro = (v: string | null) => (v == null ? '' : formatNumero(v, 2));
const pct = (v: string | null) => (v == null ? '' : formatNumero(v, 0, 4));

export function formDaCotacao(q: Cotacao): FormSpot {
  return {
    cliente:
      q.clientId && q.clientName
        ? { id: q.clientId, name: q.clientName, email: q.clientEmail }
        : null,
    origem: q.originCity && q.originUf ? { nome: q.originCity, uf: q.originUf } : null,
    destino: q.destCity && q.destUf ? { nome: q.destCity, uf: q.destUf } : null,
    modal: q.modal === 'AEREO' ? 'AEREO' : 'RODOVIARIO',
    custos: {
      RODOVIARIO: dinheiro(q.costs.RODOVIARIO),
      COLETA: dinheiro(q.costs.COLETA),
      AEREO: dinheiro(q.costs.AEREO),
      ENTREGA: dinheiro(q.costs.ENTREGA),
    },
    pedagio: Number(q.toll) === 0 ? '' : dinheiro(q.toll),
    markup: Number(q.markupPct) === 0 ? '' : pct(q.markupPct),
    adValorem: pct(q.adValoremPct),
    mercadoria: dinheiro(q.goodsValue),
    obs: q.notes ?? '',
  };
}

export function payloadDoForm(f: FormSpot) {
  return {
    clientId: f.cliente?.id,
    originCity: f.origem?.nome ?? '',
    originUf: f.origem?.uf ?? '',
    destCity: f.destino?.nome ?? '',
    destUf: f.destino?.uf ?? '',
    modal: f.modal,
    costs: f.custos,
    toll: f.pedagio,
    markupPct: f.markup,
    adValoremPct: f.adValorem,
    goodsValue: f.mercadoria,
    notes: f.obs,
  };
}

export interface Calculo {
  resultado: ResultadoSpot | null;
  erro: ErroValidacao | null;
}

/** Cálculo ao vivo no navegador (mesmo núcleo do servidor). */
export function calcular(f: FormSpot, cfg?: Configuracoes): Calculo {
  try {
    return {
      resultado: calcularSpot({
        modal: f.modal,
        custos: f.custos,
        pedagio: f.pedagio,
        markupPct: f.markup,
        adValoremPct: f.adValorem,
        valorMercadoria: f.mercadoria,
        ...(cfg ? { padroesAdValorem: cfg.adValorem } : {}),
      }),
      erro: null,
    };
  } catch (e) {
    if (e instanceof ErroValidacao) return { resultado: null, erro: e };
    throw e;
  }
}

/** Campo da API/núcleo → id do campo na tela. */
export function idDoCampo(campo: string | undefined): string | null {
  if (!campo) return null;
  const mapa: Record<string, string> = {
    clientId: 'spot-cliente',
    originCity: 'spot-origem',
    originUf: 'spot-origem',
    destCity: 'spot-destino',
    destUf: 'spot-destino',
    pedagio: 'spot-pedagio',
    toll: 'spot-pedagio',
    markupPct: 'spot-markup',
    adValoremPct: 'spot-advalorem',
    valorMercadoria: 'spot-mercadoria',
    goodsValue: 'spot-mercadoria',
    notes: 'spot-obs',
  };
  if (campo.startsWith('custos.')) return `spot-custo-${campo.slice(7)}`;
  return mapa[campo] ?? null;
}

// ── Rascunho local (por usuário) ──

interface Rascunho {
  form: FormSpot;
  editandoId: string | null;
}

const chave = (userId: string) => `jat-rascunho-spot:${userId}`;

export function lerRascunho(userId: string): Rascunho | null {
  try {
    const bruto = localStorage.getItem(chave(userId));
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Rascunho;
    return {
      form: { ...FORM_VAZIO, ...r.form, custos: { ...FORM_VAZIO.custos, ...r.form.custos } },
      editandoId: r.editandoId ?? null,
    };
  } catch {
    return null;
  }
}

export function salvarRascunho(userId: string, r: Rascunho) {
  try {
    localStorage.setItem(chave(userId), JSON.stringify(r));
  } catch {
    /* sem armazenamento: ignora */
  }
}

export function apagarRascunho(userId: string) {
  try {
    localStorage.removeItem(chave(userId));
  } catch {
    /* ignora */
  }
}

export const formVazioOuIgual = (a: FormSpot, b: FormSpot) =>
  JSON.stringify(a) === JSON.stringify(b);
