import { calcularCubagem, formatNumero } from '@jat/core';
import { lerRascunho, salvarRascunho } from '@/pages/spot/estado';

interface LinhaCubagem {
  c: string;
  l: string;
  a: string;
  peso: string;
  qtd: string;
}

/**
 * Peso taxado AÉREO da cubagem em andamento (rascunho do usuário), para a calculadora
 * de tarifas. Usa sempre o fator aéreo, mesmo que a cubagem esteja no rodoviário.
 * Devolve null se não houver volume completo ou se houver erro nos dados.
 */
export function pesoTaxadoAereoDaCubagem(userId: string): string | null {
  try {
    const bruto = localStorage.getItem(`jat-rascunho-cubagem:${userId}`);
    if (!bruto) return null;
    const { linhas } = JSON.parse(bruto) as { linhas?: LinhaCubagem[] };
    const usadas = (linhas ?? []).filter((l) => l.c && l.l && l.a);
    if (usadas.length === 0) return null;
    const r = calcularCubagem({
      modal: 'AEREO',
      volumes: usadas.map((l) => ({
        comprimentoM: l.c,
        larguraM: l.l,
        alturaM: l.a,
        pesoBrutoKg: l.peso,
        quantidade: l.qtd,
      })),
    });
    return r.pesoTaxadoTotal.isZero() ? null : formatNumero(r.pesoTaxadoTotal);
  } catch {
    return null;
  }
}

/**
 * "Usar no Frete Spot": coloca o valor no Custo Aéreo do rascunho do Spot (modal Aéreo).
 * Os demais campos do rascunho são mantidos.
 */
export function enviarCustoAereoParaSpot(userId: string, valor: string) {
  const r = lerRascunho(userId);
  const form = r?.form;
  salvarRascunho(userId, {
    editandoId: r?.editandoId ?? null,
    form: {
      ...(form ?? {
        cliente: null,
        origem: null,
        destino: null,
        pedagio: '',
        markup: '',
        adValorem: '',
        mercadoria: '',
        obs: '',
        custos: { RODOVIARIO: '', COLETA: '', AEREO: '', ENTREGA: '' },
      }),
      modal: 'AEREO',
      custos: {
        RODOVIARIO: form?.custos.RODOVIARIO ?? '',
        COLETA: form?.custos.COLETA ?? '',
        ENTREGA: form?.custos.ENTREGA ?? '',
        AEREO: formatNumero(valor),
      },
    },
  });
}
