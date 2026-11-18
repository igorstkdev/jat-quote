import { formatarNumeroCotacao } from '@jat/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { registrarAuditoria } from '../lib/audit.js';
import { requisicaoInvalida } from '../lib/errors.js';
import { dadosCotacaoImportada, lerPlanilhaCotacoes } from '../lib/importar-cotacoes.js';
import { lerAdValoremPadrao, lerCondicoesSpot } from '../lib/settings.js';
import { exigir } from '../plugins/auth.js';

/** Frase da confirmação forte para apagar os dados de teste. */
export const FRASE_REMOVER_TESTE = 'REMOVER DADOS DE TESTE';

const importBody = z.object({
  /** Planilha .xlsx em base64. */
  file: z.string().min(1, 'Escolha a planilha.').max(14_000_000, 'Planilha grande demais.'),
  confirm: z.boolean().optional(),
});
const removerBody = z.object({ confirmation: z.string() });

/**
 * Cotações de TESTE importadas da planilha (17/11/2026), só Admin:
 * prévia → confirmar; e remoção em lote (só as marcadas como teste).
 */
export function quoteImportRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const admin = { preHandler: exigir({ admin: true }) };

    app.post('/api/quotes/import', { ...admin, bodyLimit: 15_000_000 }, async (req) => {
      const { file, confirm } = importBody.parse(req.body);
      let lido;
      try {
        lido = await lerPlanilhaCotacoes(file);
      } catch (e) {
        throw requisicaoInvalida((e as Error).message);
      }
      const { linhas, total } = lido;
      const erros = new Map(lido.erros.map((e) => [e.linha, e]));

      // Número JQ já usado (no sistema, inclusive excluídas, ou repetido na planilha).
      const existentes = new Set(
        (
          await db.quote.findMany({
            where: { number: { in: linhas.map((l) => l.numero) } },
            select: { number: true },
          })
        ).map((q) => q.number),
      );
      const vistos = new Set<number>();
      const validas = linhas.filter((l) => {
        const item = `${formatarNumeroCotacao(l.numero)} — ${l.cliente}`;
        if (existentes.has(l.numero)) {
          erros.set(l.linha, {
            linha: l.linha,
            item,
            erro: `${formatarNumeroCotacao(l.numero)} já existe no sistema.`,
          });
          return false;
        }
        if (vistos.has(l.numero)) {
          erros.set(l.linha, { linha: l.linha, item, erro: 'Nº repetido na planilha.' });
          return false;
        }
        vistos.add(l.numero);
        return true;
      });

      const rows = [
        ...validas.map((l) => ({
          linha: l.linha,
          acao: 'criar' as const,
          rota: `${formatarNumeroCotacao(l.numero)} — ${l.cliente}`,
        })),
        ...[...erros.values()].map((e) => ({
          linha: e.linha,
          acao: 'erro' as const,
          rota: e.item,
          erro: e.erro,
        })),
      ].sort((a, b) => a.linha - b.linha);
      const summary = { total, criar: validas.length, atualizar: 0, igual: 0, erros: erros.size };
      if (!confirm || erros.size > 0 || validas.length === 0) {
        return { applied: false, summary, rows };
      }

      const u = req.user!;
      const adValorem = await lerAdValoremPadrao(db);
      const termos = await lerCondicoesSpot(db);
      const clientesCriados = await db.$transaction(
        async (tx) => {
          // Clientes pelo nome (sem diferenciar maiúsculas); os que faltam são criados.
          const ativos = await tx.client.findMany({ where: { active: true } });
          const porNome = new Map(ativos.map((c) => [c.name.toLowerCase(), c]));
          let criados = 0;
          for (const l of validas) {
            let c = porNome.get(l.cliente.toLowerCase());
            if (!c) {
              c = await tx.client.create({ data: { name: l.cliente } });
              porNome.set(c.name.toLowerCase(), c);
              criados++;
            }
            const q = await tx.quote.create({
              data: {
                ...dadosCotacaoImportada(l, {
                  clientId: c.id,
                  clientName: c.name,
                  adValoremPct: adValorem[l.modal],
                  termos: termos[l.modal],
                }),
                createdById: u.id,
              },
            });
            await tx.quoteStatusChange.create({
              data: {
                quoteId: q.id,
                fromStatus: null,
                toStatus: l.status,
                userId: u.id,
                at: l.data,
              },
            });
          }
          // A numeração continua depois do maior número existente.
          await tx.$executeRawUnsafe(
            `select setval(pg_get_serial_sequence('quotes', 'number'), (select max(number) from quotes))`,
          );
          await registrarAuditoria(tx, req, {
            action: 'IMPORTAR',
            entity: 'cotacao',
            details: { quantidade: validas.length, clientesCriados: criados, dadosDeTeste: true },
          });
          return criados;
        },
        { timeout: 120_000 },
      );
      return { applied: true, summary, rows, clientesCriados };
    });

    app.get('/api/quotes/test-data', admin, async () => ({
      count: await db.quote.count({ where: { isTestData: true } }),
    }));

    app.post('/api/quotes/test-data/remove', admin, async (req) => {
      const { confirmation } = removerBody.parse(req.body);
      if (confirmation.trim().toUpperCase() !== FRASE_REMOVER_TESTE) {
        throw requisicaoInvalida(`Digite ${FRASE_REMOVER_TESTE} para confirmar.`, 'confirmation');
      }
      const count = await db.$transaction(async (tx) => {
        // Só as cotações marcadas como teste (o histórico de status vai junto).
        const r = await tx.quote.deleteMany({ where: { isTestData: true } });
        await registrarAuditoria(tx, req, {
          action: 'EXCLUIR',
          entity: 'cotacao',
          details: { dadosDeTeste: true, quantidade: r.count },
        });
        return r.count;
      });
      return { removed: count };
    });
  };
}
