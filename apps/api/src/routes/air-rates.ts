import {
  cotarRota,
  ErroValidacao,
  hojeIso,
  NIVEIS_TARIFA,
  type NivelTarifa,
  type TarifaAerea,
} from '@jat/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AirRate, Prisma } from '../generated/prisma/client.js';
import {
  airRateDto,
  airRateSchema,
  CABECALHO_CSV_TARIFAS,
  conflitoVigencia,
  csvTarifas,
  dadosDaTarifa,
  dadosParaPrisma,
  diaParaDate,
  entradaDaLinhaCsv,
  iguais,
  linhasCsv,
  mensagemConflito,
  normalizarTarifa,
  type DadosTarifa,
} from '../lib/air-rates.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { conflito, HttpError, naoEncontrado, requisicaoInvalida } from '../lib/errors.js';
import { exigir } from '../plugins/auth.js';

const idParam = z.object({ id: z.uuid('Identificador inválido.') });
const statusBody = z.object({ active: z.boolean() });
const importBody = z.object({
  csv: z.string().max(5_000_000, 'Arquivo grande demais.'),
  confirm: z.boolean().default(false),
});
const arquivarBody = z.object({ confirmation: z.string() });
export const FRASE_EXCLUIR_TUDO = 'EXCLUIR TUDO';
const cotarQuery = z.object({
  origin: z.string().trim().max(3),
  destination: z.string().trim().max(3),
  level: z.enum(NIVEIS_TARIFA as [NivelTarifa, ...NivelTarifa[]], {
    error: 'Escolha o nível (Urgente, Rápido ou Econômico).',
  }),
  weight: z.string().trim().max(30),
});

type Tx = Prisma.TransactionClient;

/** Dados "planos" para a auditoria mostrar campo a campo. */
const plano = (d: DadosTarifa) => ({
  ...d,
  levels: undefined,
  ...Object.fromEntries(
    NIVEIS_TARIFA.flatMap((n) => [
      [`${n}.perKg`, d.levels[n]?.perKg ?? null],
      [`${n}.min`, d.levels[n]?.min ?? null],
    ]),
  ),
});

export function airRateRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const editor = { preHandler: exigir({ editarTarifas: true }) };
    const admin = { preHandler: exigir({ admin: true }) };

    async function buscar(id: string) {
      const r = await db.airRate.findFirst({ where: { id, archivedAt: null } });
      if (!r) throw naoEncontrado('Tarifa');
      return r;
    }

    async function vizinhas(tx: Tx | Db, d: DadosTarifa, exceto?: string) {
      const rs = await tx.airRate.findMany({
        where: {
          archivedAt: null,
          active: true,
          origin: d.origin,
          destination: d.destination,
          airline: d.airline,
          ...(exceto ? { id: { not: exceto } } : {}),
        },
      });
      return rs.map(dadosDaTarifa);
    }

    async function historico(tx: Tx, r: AirRate, action: string, req: FastifyRequest) {
      await tx.airRateHistory.create({
        data: {
          airRateId: r.id,
          version: r.version,
          action,
          snapshot: { ...dadosDaTarifa(r), version: r.version } as Prisma.InputJsonValue,
          userId: req.user!.id,
          username: req.user!.username,
        },
      });
    }

    async function criar(tx: Tx, d: DadosTarifa, req: FastifyRequest, acao = 'CRIAR') {
      const r = await tx.airRate.create({ data: { ...dadosParaPrisma(d), version: 1 } });
      await historico(tx, r, acao, req);
      return r;
    }

    async function atualizar(
      tx: Tx,
      antes: AirRate,
      d: DadosTarifa,
      req: FastifyRequest,
      acao = 'EDITAR',
    ) {
      const r = await tx.airRate.update({
        where: { id: antes.id },
        data: { ...dadosParaPrisma(d), version: antes.version + 1 },
      });
      await historico(tx, r, acao, req);
      return r;
    }

    app.get('/api/air-rates', logado, async () => {
      const hoje = hojeIso();
      const rs = await db.airRate.findMany({
        where: { archivedAt: null },
        orderBy: [
          { origin: 'asc' },
          { destination: 'asc' },
          { airline: 'asc' },
          { validFrom: 'desc' },
        ],
      });
      return { rates: rs.map((r) => airRateDto(r, hoje)), today: hoje };
    });

    app.get('/api/air-rates/:id/history', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const r = await db.airRate.findUnique({ where: { id } });
      if (!r) throw naoEncontrado('Tarifa');
      const history = await db.airRateHistory.findMany({
        where: { airRateId: id },
        orderBy: { at: 'desc' },
      });
      return { history };
    });

    app.post('/api/air-rates', editor, async (req, reply) => {
      const d = normalizarTarifa(airRateSchema.parse(req.body));
      const duplicadaDe = (req.body as { duplicatedFrom?: unknown }).duplicatedFrom;
      const c = conflitoVigencia(d, await vizinhas(db, d));
      if (c) throw conflito(mensagemConflito(c), 'validFrom');
      const r = await db.$transaction(async (tx) => {
        const r = await criar(tx, d, req);
        await registrarAuditoria(tx, req, {
          action: 'CRIAR',
          entity: 'tarifa_aerea',
          entityId: r.id,
          details: {
            ...plano(d),
            ...(typeof duplicadaDe === 'string' ? { duplicadaDe } : {}),
          },
        });
        return r;
      });
      return reply.code(201).send({ rate: airRateDto(r) });
    });

    app.put('/api/air-rates/:id', editor, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await buscar(id);
      const d = normalizarTarifa(airRateSchema.parse(req.body));
      const da = dadosDaTarifa(antes);
      if (iguais(d, da)) return { rate: airRateDto(antes) };
      const c = conflitoVigencia(d, await vizinhas(db, d, id));
      if (c) throw conflito(mensagemConflito(c), 'validFrom');
      const r = await db.$transaction(async (tx) => {
        const r = await atualizar(tx, antes, d, req);
        await registrarAuditoria(tx, req, {
          action: 'EDITAR',
          entity: 'tarifa_aerea',
          entityId: id,
          details: { versao: r.version, ...diferencas(plano(da), plano(d)) },
        });
        return r;
      });
      return { rate: airRateDto(r) };
    });

    app.post('/api/air-rates/:id/status', editor, async (req) => {
      const { id } = idParam.parse(req.params);
      const { active } = statusBody.parse(req.body);
      const antes = await buscar(id);
      if (antes.active === active) return { rate: airRateDto(antes) };
      const d = { ...dadosDaTarifa(antes), active };
      const c = conflitoVigencia(d, await vizinhas(db, d, id));
      if (c) throw conflito(mensagemConflito(c));
      const r = await db.$transaction(async (tx) => {
        const r = await tx.airRate.update({ where: { id }, data: { active } });
        await historico(tx, r, active ? 'ATIVAR' : 'DESATIVAR', req);
        await registrarAuditoria(tx, req, {
          action: active ? 'ATIVAR' : 'DESATIVAR',
          entity: 'tarifa_aerea',
          entityId: id,
          details: { rota: `${r.airline} ${r.origin} → ${r.destination}` },
        });
        return r;
      });
      return { rate: airRateDto(r) };
    });

    /** "Excluir Tudo" = arquivar (decisão de 08/11/2026). Somente Admin, com frase de confirmação. */
    app.post('/api/air-rates/archive-all', admin, async (req) => {
      const { confirmation } = arquivarBody.parse(req.body);
      if (confirmation.trim().toUpperCase() !== FRASE_EXCLUIR_TUDO) {
        throw requisicaoInvalida(`Digite ${FRASE_EXCLUIR_TUDO} para confirmar.`, 'confirmation');
      }
      const { count } = await db.$transaction(async (tx) => {
        const res = await tx.airRate.updateMany({
          where: { archivedAt: null },
          data: { archivedAt: new Date(), active: false },
        });
        await registrarAuditoria(tx, req, {
          action: 'ARQUIVAR',
          entity: 'tarifa_aerea',
          details: { quantidade: res.count },
        });
        return res;
      });
      return { archived: count };
    });

    app.get('/api/air-rates/export', logado, async (_req, reply) => {
      const rs = await db.airRate.findMany({
        where: { archivedAt: null },
        orderBy: [
          { origin: 'asc' },
          { destination: 'asc' },
          { airline: 'asc' },
          { validFrom: 'asc' },
        ],
      });
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="tarifas_aereas_${hojeIso()}.csv"`)
        .header('Cache-Control', 'no-store')
        .send(csvTarifas(rs));
    });

    /**
     * Importação do CSV (layout do app atual). Sem `confirm`, só valida e devolve a prévia.
     * Linha com mesma rota + companhia + início de vigência de uma tarifa existente = atualização.
     * Com qualquer erro, nada é gravado.
     */
    app.post('/api/air-rates/import', { ...editor, bodyLimit: 6_000_000 }, async (req) => {
      const { csv, confirm } = importBody.parse(req.body);
      const linhas = linhasCsv(
        csv,
        CABECALHO_CSV_TARIFAS.filter((c) => c !== 'Versão' && c !== 'Observações'),
      );

      const existentes = await db.airRate.findMany({ where: { archivedAt: null } });
      const estado = new Map<string, DadosTarifa>(existentes.map((r) => [r.id, dadosDaTarifa(r)]));
      const chave = (d: DadosTarifa) => `${d.origin}|${d.destination}|${d.airline}|${d.validFrom}`;
      const porChave = new Map(existentes.map((r) => [chave(dadosDaTarifa(r)), r]));
      const vistas = new Map<string, number>();
      const novas: { linha: number; d: DadosTarifa }[] = [];
      const atualizacoes: { linha: number; antes: AirRate; d: DadosTarifa }[] = [];

      type Resultado = {
        linha: number;
        acao: 'criar' | 'atualizar' | 'igual' | 'erro';
        rota?: string;
        erro?: string;
      };
      const resultado: Resultado[] = [];

      for (const { linha, get } of linhas) {
        try {
          const d = normalizarTarifa(airRateSchema.parse(entradaDaLinhaCsv(get)));
          const rota = `${d.airline} ${d.origin} → ${d.destination}`;
          const k = chave(d);
          const repetida = vistas.get(k);
          if (repetida) {
            throw new ErroValidacao(
              'linha',
              `Linha repetida no arquivo (igual à linha ${repetida}).`,
            );
          }
          vistas.set(k, linha);
          const existente = porChave.get(k);
          const outras = [
            ...[...estado.entries()].filter(([id]) => id !== existente?.id).map(([, v]) => v),
            ...novas.map((n) => n.d),
          ];
          const c = conflitoVigencia(d, outras);
          if (c) throw new ErroValidacao('validFrom', mensagemConflito(c));
          if (existente) {
            if (iguais(d, dadosDaTarifa(existente))) {
              resultado.push({ linha, acao: 'igual', rota });
            } else {
              estado.set(existente.id, d);
              atualizacoes.push({ linha, antes: existente, d });
              resultado.push({ linha, acao: 'atualizar', rota });
            }
          } else {
            novas.push({ linha, d });
            resultado.push({ linha, acao: 'criar', rota });
          }
        } catch (e) {
          if (e instanceof ErroValidacao || e instanceof HttpError) {
            resultado.push({ linha, acao: 'erro', erro: e.message });
          } else if (e instanceof z.ZodError) {
            resultado.push({
              linha,
              acao: 'erro',
              erro: e.issues[0]?.message ?? 'Dados inválidos.',
            });
          } else {
            throw e;
          }
        }
      }

      const resumo = {
        total: resultado.length,
        criar: novas.length,
        atualizar: atualizacoes.length,
        igual: resultado.filter((r) => r.acao === 'igual').length,
        erros: resultado.filter((r) => r.acao === 'erro').length,
      };
      if (!confirm || resumo.erros > 0 || resumo.total === 0) {
        return { applied: false, summary: resumo, rows: resultado };
      }

      await db.$transaction(
        async (tx) => {
          for (const { d } of novas) await criar(tx, d, req, 'IMPORTAR');
          for (const { antes, d } of atualizacoes) await atualizar(tx, antes, d, req, 'IMPORTAR');
          await registrarAuditoria(tx, req, {
            action: 'IMPORTAR',
            entity: 'tarifa_aerea',
            details: {
              criadas: resumo.criar,
              atualizadas: resumo.atualizar,
              semAlteracao: resumo.igual,
            },
          });
        },
        { timeout: 60_000 },
      );
      return { applied: true, summary: resumo, rows: resultado };
    });

    /** Calculadora rápida: só tarifas ativas e vigentes hoje, ordenadas pelo menor custo. */
    app.get('/api/air-rates/quote', logado, async (req) => {
      const q = cotarQuery.parse(req.query);
      const hoje = diaParaDate(hojeIso());
      const origem = q.origin.toUpperCase();
      const destino = q.destination.toUpperCase();
      const rs = await db.airRate.findMany({
        where: {
          archivedAt: null,
          active: true,
          origin: origem,
          destination: destino,
          validFrom: { lte: hoje },
          OR: [{ validTo: null }, { validTo: { gte: hoje } }],
        },
      });
      const porId = new Map(rs.map((r) => [r.id, r]));
      const tarifas: TarifaAerea[] = rs.map((r) => {
        const d = dadosDaTarifa(r);
        const niveis: TarifaAerea['niveis'] = {};
        for (const n of NIVEIS_TARIFA) {
          const l = d.levels[n];
          niveis[n] = l ? { tarifaKg: l.perKg, minimo: l.min } : null;
        }
        return { id: r.id, origem: d.origin, destino: d.destination, companhia: d.airline, niveis };
      });
      const opcoes = cotarRota(tarifas, {
        origem: q.origin,
        destino: q.destination,
        nivel: q.level,
        peso: q.weight,
      });
      return {
        options: opcoes.map((o) => {
          const r = porId.get(o.tarifaId!)!;
          return {
            airline: o.companhia,
            rateId: r.id,
            version: r.version,
            perKg: o.tarifaKg.toString(),
            min: o.minimo.toFixed(2),
            calculated: o.calculado.toFixed(2),
            value: o.valor.toFixed(2),
            minimumApplied: o.aplicouMinimo,
          };
        }),
      };
    });

    /** Aeroportos com tarifa cadastrada (autocompletar da calculadora). */
    app.get('/api/air-rates/airports', logado, async () => {
      const rs = await db.airRate.findMany({
        where: { archivedAt: null, active: true },
        select: { origin: true, destination: true },
        distinct: ['origin', 'destination'],
      });
      return { routes: rs.map((r) => [r.origin, r.destination] as const) };
    });
  };
}
