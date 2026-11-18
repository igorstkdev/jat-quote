import {
  FORMATOS_CONDICOES,
  MAX_TAMANHO_TEXTO,
  MAX_TAMANHO_TOPICO,
  MAX_TOPICOS,
  normalizarCondicoes,
} from '@jat/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { naoEncontrado } from '../lib/errors.js';
import {
  CHAVES,
  lerAdValoremPadrao,
  lerCondicoesFtl,
  lerCondicoesSpot,
  lerLinksRastreio,
} from '../lib/settings.js';
import { exigir } from '../plugins/auth.js';

const pct = z
  .string()
  .trim()
  .transform((v) => v.replace(',', '.'))
  .refine((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) <= 100, {
    message: 'Informe um percentual entre 0 e 100, com até 4 casas decimais.',
  })
  .transform((v) => String(Number(v)));

const adValoremSchema = z.object({ AEREO: pct, RODOVIARIO: pct });
/** Um conjunto de termos: tópicos ou texto livre (17/11/2026). Pode ficar vazio. */
const condicoesSchema = z
  .object({
    formato: z.enum(FORMATOS_CONDICOES, { error: 'Escolha o formato: tópicos ou texto livre.' }),
    topicos: z
      .array(
        z
          .string()
          .max(
            MAX_TAMANHO_TOPICO,
            `Cada tópico pode ter no máximo ${MAX_TAMANHO_TOPICO} caracteres.`,
          ),
      )
      .max(MAX_TOPICOS, `Use no máximo ${MAX_TOPICOS} tópicos.`),
    texto: z
      .string()
      .max(MAX_TAMANHO_TEXTO, `O texto pode ter no máximo ${MAX_TAMANHO_TEXTO} caracteres.`),
  })
  .transform(normalizarCondicoes);
const condicoesSpotSchema = z.object({
  conditions: z.object({ RODOVIARIO: condicoesSchema, AEREO: condicoesSchema }),
});
const condicoesFtlSchema = z.object({
  conditions: z.object({
    UTILITARIO: condicoesSchema,
    VAN: condicoesSchema,
    TRES_QUARTOS: condicoesSchema,
  }),
});

const urlSchema = z
  .string()
  .trim()
  .url('Informe um endereço completo, começando com http:// ou https://.')
  .refine((u) => /^https?:\/\//i.test(u), 'O endereço deve começar com http:// ou https://.');

const linkSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do link.').max(60),
  url: urlSchema,
  active: z.boolean().default(true),
});
const rastreioSchema = z.object({
  links: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Informe o nome do link.').max(60),
        url: urlSchema,
      }),
    )
    .max(10, 'Use no máximo 10 links de rastreio.'),
});
const ordemSchema = z.object({ ids: z.array(z.uuid()).max(100) });
const idParam = z.object({ id: z.uuid('Identificador inválido.') });

export function settingsRoutes(db: Db) {
  /** Grava um conjunto de condições e registra na auditoria o que mudou (por modal/veículo). */
  async function salvarCondicoes(
    req: FastifyRequest,
    chave: string,
    antes: Record<string, unknown>,
    depois: Record<string, unknown>,
  ) {
    const value = depois as Prisma.InputJsonValue;
    await db.setting.upsert({
      where: { key: chave },
      create: { key: chave, value },
      update: { value },
    });
    const mudancas: Record<string, { de: unknown; para: unknown }> = {};
    for (const k of Object.keys(depois)) {
      if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) {
        mudancas[k] = { de: antes[k], para: depois[k] };
      }
    }
    if (Object.keys(mudancas).length > 0) {
      await registrarAuditoria(db, req, {
        action: 'EDITAR',
        entity: 'configuracao',
        entityId: chave,
        details: mudancas,
      });
    }
  }

  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const admin = { preHandler: exigir({ admin: true }) };

    // ── Configurações gerais (leitura para todos os logados) ──
    app.get('/api/settings', logado, async () => ({
      adValorem: await lerAdValoremPadrao(db),
      condicoesFtl: await lerCondicoesFtl(db),
      condicoesSpot: await lerCondicoesSpot(db),
      linksRastreio: await lerLinksRastreio(db),
    }));

    app.put('/api/settings/ad-valorem', admin, async (req) => {
      const novo = adValoremSchema.parse(req.body);
      const antes = await lerAdValoremPadrao(db);
      await db.setting.upsert({
        where: { key: CHAVES.adValorem },
        create: { key: CHAVES.adValorem, value: novo },
        update: { value: novo },
      });
      const mudancas = diferencas(antes as never, novo as never);
      if (Object.keys(mudancas).length > 0) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'configuracao',
          entityId: CHAVES.adValorem,
          details: mudancas,
        });
      }
      return { adValorem: novo };
    });

    app.put('/api/settings/ftl-conditions', admin, async (req) => {
      const { conditions } = condicoesFtlSchema.parse(req.body);
      const antes = await lerCondicoesFtl(db);
      await salvarCondicoes(req, CHAVES.condicoesFtlVeiculos, antes, conditions);
      return { condicoesFtl: conditions };
    });

    app.put('/api/settings/spot-conditions', admin, async (req) => {
      const { conditions } = condicoesSpotSchema.parse(req.body);
      const antes = await lerCondicoesSpot(db);
      await salvarCondicoes(req, CHAVES.condicoesSpot, antes, conditions);
      return { condicoesSpot: conditions };
    });

    app.put('/api/settings/tracking-links', admin, async (req) => {
      const { links } = rastreioSchema.parse(req.body);
      const antes = await lerLinksRastreio(db);
      await db.setting.upsert({
        where: { key: CHAVES.linksRastreio },
        create: { key: CHAVES.linksRastreio, value: links },
        update: { value: links },
      });
      if (JSON.stringify(antes) !== JSON.stringify(links)) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'configuracao',
          entityId: CHAVES.linksRastreio,
          details: { links: { de: antes, para: links } },
        });
      }
      return { linksRastreio: links };
    });

    // ── Links úteis ──
    app.get('/api/links', logado, async (req) => {
      const todos = req.user!.role === 'ADMIN' && (req.query as { all?: string }).all === '1';
      const links = await db.usefulLink.findMany({
        where: todos ? {} : { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return { links };
    });

    app.post('/api/links', admin, async (req, reply) => {
      const dados = linkSchema.parse(req.body);
      const ultimo = await db.usefulLink.findFirst({ orderBy: { sortOrder: 'desc' } });
      const link = await db.usefulLink.create({
        data: { ...dados, sortOrder: (ultimo?.sortOrder ?? 0) + 1 },
      });
      await registrarAuditoria(db, req, {
        action: 'CRIAR',
        entity: 'link',
        entityId: link.id,
        details: { name: link.name, url: link.url },
      });
      return reply.code(201).send({ link });
    });

    app.patch('/api/links/:id', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const dados = linkSchema.partial().parse(req.body);
      const antes = await db.usefulLink.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Link');
      const link = await db.usefulLink.update({ where: { id }, data: dados });
      const mudancas = diferencas(antes, link);
      if (Object.keys(mudancas).length > 0) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'link',
          entityId: id,
          details: mudancas,
        });
      }
      return { link };
    });

    app.put('/api/links/order', admin, async (req) => {
      const { ids } = ordemSchema.parse(req.body);
      await db.$transaction(
        ids.map((id, i) => db.usefulLink.update({ where: { id }, data: { sortOrder: i + 1 } })),
      );
      return { status: 'ok' };
    });

    app.delete('/api/links/:id', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await db.usefulLink.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Link');
      await db.usefulLink.delete({ where: { id } });
      await registrarAuditoria(db, req, {
        action: 'EXCLUIR',
        entity: 'link',
        entityId: id,
        details: { name: antes.name, url: antes.url },
      });
      return { status: 'ok' };
    });
  };
}
