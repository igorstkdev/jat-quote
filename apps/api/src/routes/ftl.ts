import { calcularFtl, ErroValidacao, hojeIso, VEICULOS_FTL, type VeiculoFtl } from '@jat/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { FtlRate, Prisma } from '../generated/prisma/client.js';
import { linhasCsv } from '../lib/air-rates.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { conflito, HttpError, naoEncontrado, requisicaoInvalida } from '../lib/errors.js';
import {
  CABECALHO_CSV_FTL,
  csvTabelasFtl,
  dadosDaTabela,
  dadosTabelaParaPrisma,
  entradaFtlDaLinhaCsv,
  ftlRateDto,
  ftlRateSchema,
  mensagemTabelaAtiva,
  normalizarTabelaFtl,
  ROTULO_LOCALIDADE,
  tabelasIguais,
  tarifaFtlCore,
  type DadosTabelaFtl,
} from '../lib/ftl.js';
import { INCLUIR_COTACAO, quoteDto } from '../lib/quotes.js';
import { exigir } from '../plugins/auth.js';
import { FRASE_EXCLUIR_TUDO } from './air-rates.js';

const idParam = z.object({ id: z.uuid('Identificador inválido.') });
const statusBody = z.object({ active: z.boolean() });
const importBody = z.object({
  csv: z.string().max(5_000_000, 'Arquivo grande demais.'),
  confirm: z.boolean().default(false),
});
const arquivarBody = z.object({ confirmation: z.string() });

const cotacaoSchema = z.object({
  uf: z.string().trim().length(2, 'Escolha a UF de destino.'),
  locality: z.enum(['CAPITAL', 'INTERIOR'], { error: 'Escolha o tipo de localidade.' }),
  vehicle: z.enum(VEICULOS_FTL as [VeiculoFtl, ...VeiculoFtl[]], {
    error: 'Escolha o tipo de veículo.',
  }),
  distanceKm: z.union([z.string().max(30), z.number(), z.null()]).optional(),
  notes: z.string().trim().max(2000, 'Observações: use no máximo 2.000 caracteres.').nullish(),
});

const listaQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['PENDENTE', 'APROVADA', 'DECLINADA', 'RECUSADA']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

type Tx = Prisma.TransactionClient;

const plano = (d: DadosTabelaFtl) => ({
  ...d,
  perKm: undefined,
  'perKm.UTILITARIO': d.perKm.UTILITARIO,
  'perKm.VAN': d.perKm.VAN,
  'perKm.TRES_QUARTOS': d.perKm.TRES_QUARTOS,
});

/** Início do dia (fuso de São Paulo) de uma data aaaa-mm-dd. */
const inicioDiaSP = (iso: string) => new Date(`${iso}T00:00:00-03:00`);

export function ftlRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const editor = { preHandler: exigir({ editarTarifas: true }) };
    const admin = { preHandler: exigir({ admin: true }) };

    async function buscar(id: string) {
      const r = await db.ftlRate.findFirst({ where: { id, archivedAt: null } });
      if (!r) throw naoEncontrado('Tabela');
      return r;
    }

    /** Só uma tabela ativa por UF + tipo de localidade. */
    async function outraAtiva(d: DadosTabelaFtl, exceto?: string) {
      if (!d.active) return null;
      return db.ftlRate.findFirst({
        where: {
          archivedAt: null,
          active: true,
          uf: d.uf,
          locality: d.locality,
          ...(exceto ? { id: { not: exceto } } : {}),
        },
      });
    }

    async function historico(tx: Tx, r: FtlRate, action: string, req: FastifyRequest) {
      await tx.ftlRateHistory.create({
        data: {
          ftlRateId: r.id,
          version: r.version,
          action,
          snapshot: { ...dadosDaTabela(r), version: r.version } as Prisma.InputJsonValue,
          userId: req.user!.id,
          username: req.user!.username,
        },
      });
    }

    async function criar(tx: Tx, d: DadosTabelaFtl, req: FastifyRequest, acao = 'CRIAR') {
      const r = await tx.ftlRate.create({ data: { ...dadosTabelaParaPrisma(d), version: 1 } });
      await historico(tx, r, acao, req);
      return r;
    }

    async function atualizar(
      tx: Tx,
      antes: FtlRate,
      d: DadosTabelaFtl,
      req: FastifyRequest,
      acao = 'EDITAR',
    ) {
      const r = await tx.ftlRate.update({
        where: { id: antes.id },
        data: { ...dadosTabelaParaPrisma(d), version: antes.version + 1 },
      });
      await historico(tx, r, acao, req);
      return r;
    }

    // ── Tabelas de preço ──

    app.get('/api/ftl/rates', logado, async () => {
      const rs = await db.ftlRate.findMany({
        where: { archivedAt: null },
        orderBy: [{ uf: 'asc' }, { locality: 'asc' }, { active: 'desc' }, { updatedAt: 'desc' }],
      });
      return { rates: rs.map(ftlRateDto) };
    });

    app.get('/api/ftl/rates/:id/history', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const r = await db.ftlRate.findUnique({ where: { id } });
      if (!r) throw naoEncontrado('Tabela');
      const history = await db.ftlRateHistory.findMany({
        where: { ftlRateId: id },
        orderBy: { at: 'desc' },
      });
      return { history };
    });

    app.post('/api/ftl/rates', editor, async (req, reply) => {
      const d = normalizarTabelaFtl(ftlRateSchema.parse(req.body));
      if (await outraAtiva(d)) throw conflito(mensagemTabelaAtiva(d.uf, d.locality), 'uf');
      const r = await db.$transaction(async (tx) => {
        const r = await criar(tx, d, req);
        await registrarAuditoria(tx, req, {
          action: 'CRIAR',
          entity: 'tabela_ftl',
          entityId: r.id,
          details: plano(d),
        });
        return r;
      });
      return reply.code(201).send({ rate: ftlRateDto(r) });
    });

    app.put('/api/ftl/rates/:id', editor, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await buscar(id);
      const d = normalizarTabelaFtl(ftlRateSchema.parse(req.body));
      const da = dadosDaTabela(antes);
      if (tabelasIguais(d, da)) return { rate: ftlRateDto(antes) };
      if (await outraAtiva(d, id)) throw conflito(mensagemTabelaAtiva(d.uf, d.locality), 'uf');
      const r = await db.$transaction(async (tx) => {
        const r = await atualizar(tx, antes, d, req);
        await registrarAuditoria(tx, req, {
          action: 'EDITAR',
          entity: 'tabela_ftl',
          entityId: id,
          details: { versao: r.version, ...diferencas(plano(da), plano(d)) },
        });
        return r;
      });
      return { rate: ftlRateDto(r) };
    });

    app.post('/api/ftl/rates/:id/status', editor, async (req) => {
      const { id } = idParam.parse(req.params);
      const { active } = statusBody.parse(req.body);
      const antes = await buscar(id);
      if (antes.active === active) return { rate: ftlRateDto(antes) };
      const d = { ...dadosDaTabela(antes), active };
      if (await outraAtiva(d, id)) throw conflito(mensagemTabelaAtiva(d.uf, d.locality));
      const r = await db.$transaction(async (tx) => {
        const r = await tx.ftlRate.update({ where: { id }, data: { active } });
        await historico(tx, r, active ? 'ATIVAR' : 'DESATIVAR', req);
        await registrarAuditoria(tx, req, {
          action: active ? 'ATIVAR' : 'DESATIVAR',
          entity: 'tabela_ftl',
          entityId: id,
          details: { tabela: `${r.uf} ${ROTULO_LOCALIDADE[r.locality]}` },
        });
        return r;
      });
      return { rate: ftlRateDto(r) };
    });

    app.post('/api/ftl/rates/archive-all', admin, async (req) => {
      const { confirmation } = arquivarBody.parse(req.body);
      if (confirmation.trim().toUpperCase() !== FRASE_EXCLUIR_TUDO) {
        throw requisicaoInvalida(`Digite ${FRASE_EXCLUIR_TUDO} para confirmar.`, 'confirmation');
      }
      const { count } = await db.$transaction(async (tx) => {
        const res = await tx.ftlRate.updateMany({
          where: { archivedAt: null },
          data: { archivedAt: new Date(), active: false },
        });
        await registrarAuditoria(tx, req, {
          action: 'ARQUIVAR',
          entity: 'tabela_ftl',
          details: { quantidade: res.count },
        });
        return res;
      });
      return { archived: count };
    });

    app.get('/api/ftl/rates/export', logado, async (_req, reply) => {
      const rs = await db.ftlRate.findMany({
        where: { archivedAt: null },
        orderBy: [{ uf: 'asc' }, { locality: 'asc' }],
      });
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="tabelas_ftl_${hojeIso()}.csv"`)
        .header('Cache-Control', 'no-store')
        .send(csvTabelasFtl(rs));
    });

    /** Importação do CSV. Mesma UF + tipo de uma tabela existente = atualização dela. */
    app.post('/api/ftl/rates/import', { ...editor, bodyLimit: 6_000_000 }, async (req) => {
      const { csv, confirm } = importBody.parse(req.body);
      const linhas = linhasCsv(
        csv,
        CABECALHO_CSV_FTL.filter((c) => c !== 'Versão' && c !== 'Observações'),
      );
      const existentes = await db.ftlRate.findMany({
        where: { archivedAt: null },
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      });
      const chave = (d: Pick<DadosTabelaFtl, 'uf' | 'locality'>) => `${d.uf}|${d.locality}`;
      const porChave = new Map<string, FtlRate>();
      for (const r of existentes) if (!porChave.has(chave(r))) porChave.set(chave(r), r);
      // Estado final por id, para checar "uma ativa por UF + tipo".
      const estado = new Map(existentes.map((r) => [r.id, dadosDaTabela(r)]));
      const vistas = new Map<string, number>();
      const novas: DadosTabelaFtl[] = [];
      const atualizacoes: { antes: FtlRate; d: DadosTabelaFtl }[] = [];

      type Resultado = {
        linha: number;
        acao: 'criar' | 'atualizar' | 'igual' | 'erro';
        rota?: string;
        erro?: string;
      };
      const resultado: Resultado[] = [];

      for (const { linha, get } of linhas) {
        try {
          const d = normalizarTabelaFtl(ftlRateSchema.parse(entradaFtlDaLinhaCsv(get)));
          const rota = `${d.uf} ${ROTULO_LOCALIDADE[d.locality]}`;
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
          if (d.active) {
            const outra = [...estado.entries()].some(
              ([id, o]) => id !== existente?.id && o.active && chave(o) === k,
            );
            if (outra) throw new ErroValidacao('uf', mensagemTabelaAtiva(d.uf, d.locality));
          }
          if (existente) {
            if (tabelasIguais(d, dadosDaTabela(existente))) {
              resultado.push({ linha, acao: 'igual', rota });
            } else {
              estado.set(existente.id, d);
              atualizacoes.push({ antes: existente, d });
              resultado.push({ linha, acao: 'atualizar', rota });
            }
          } else {
            novas.push(d);
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
          for (const d of novas) await criar(tx, d, req, 'IMPORTAR');
          for (const { antes, d } of atualizacoes) await atualizar(tx, antes, d, req, 'IMPORTAR');
          await registrarAuditoria(tx, req, {
            action: 'IMPORTAR',
            entity: 'tabela_ftl',
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

    // ── Cotações FTL ──

    /** Salva a cotação FTL: o servidor busca a tabela ativa e recalcula. Sem cliente (08/11/2026). */
    app.post('/api/ftl/quotes', logado, async (req, reply) => {
      const e = cotacaoSchema.parse(req.body);
      const uf = e.uf.toUpperCase();
      const tabela = await db.ftlRate.findFirst({
        where: { archivedAt: null, active: true, uf, locality: e.locality },
      });
      if (!tabela) {
        throw requisicaoInvalida(
          `Não há tabela ativa para ${uf} ${ROTULO_LOCALIDADE[e.locality]}. Cadastre-a na aba Tabelas de Preço.`,
          'uf',
        );
      }
      const r = calcularFtl({
        tarifa: tarifaFtlCore(tabela),
        veiculo: e.vehicle,
        distanciaKm: e.distanceKm,
      });
      const u = req.user!;
      const total = r.total.toFixed(2);
      const quote = await db.$transaction(async (tx) => {
        const q = await tx.quote.create({
          data: {
            modal: 'FTL',
            status: 'PENDENTE',
            destUf: uf,
            ftlRateId: tabela.id,
            ftlRateVersion: tabela.version,
            ftlLocality: e.locality,
            vehicle: e.vehicle,
            distanceKm: r.distanciaKm.toString(),
            ratePerKm: r.tarifaKm.toString(),
            adValoremPct: r.adValorem.pct.toString(),
            costTotal: total,
            markupTotal: '0',
            subtotal: total,
            total,
            notes: e.notes ? e.notes : null,
            createdById: u.id,
          },
          include: INCLUIR_COTACAO,
        });
        await tx.quoteStatusChange.create({
          data: { quoteId: q.id, fromStatus: null, toStatus: 'PENDENTE', userId: u.id },
        });
        await registrarAuditoria(tx, req, {
          action: 'CRIAR',
          entity: 'cotacao',
          entityId: q.id,
          details: {
            numero: q.number,
            modal: 'FTL',
            tabela: `${uf} ${ROTULO_LOCALIDADE[e.locality]} v${tabela.version}`,
            total,
          },
        });
        return q;
      });
      return reply.code(201).send({ quote: quoteDto(quote) });
    });

    /** Relatório FTL: histórico de cotações com filtros. */
    app.get('/api/ftl/quotes', logado, async (req) => {
      const q = listaQuery.parse(req.query);
      const where: Prisma.QuoteWhereInput = { deletedAt: null, modal: 'FTL' };
      if (q.status) where.status = q.status;
      if (q.from || q.to) {
        where.createdAt = {
          ...(q.from ? { gte: inicioDiaSP(q.from) } : {}),
          ...(q.to ? { lt: new Date(inicioDiaSP(q.to).getTime() + 86_400_000) } : {}),
        };
      }
      if (q.search) {
        const n = Number(q.search.replace(/\D/g, ''));
        where.OR = [
          { destUf: { equals: q.search.toUpperCase().slice(0, 2) } },
          { ftlRate: { region: { contains: q.search, mode: 'insensitive' } } },
          { notes: { contains: q.search, mode: 'insensitive' } },
          ...(Number.isFinite(n) && n > 0 ? [{ number: n }] : []),
        ];
      }
      const quotes = await db.quote.findMany({
        where,
        include: INCLUIR_COTACAO,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      });
      return { quotes: quotes.map(quoteDto) };
    });
  };
}
