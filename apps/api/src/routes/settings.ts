import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { naoEncontrado } from '../lib/errors.js';
import { CHAVES, lerAdValoremPadrao, lerCondicoesFtl, lerLinksRastreio } from '../lib/settings.js';
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
const condicoesSchema = z.object({
  text: z.string().trim().min(10, 'O texto das condições está muito curto.').max(5000),
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
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const admin = { preHandler: exigir({ admin: true }) };

    // ── Configurações gerais (leitura para todos os logados) ──
    app.get('/api/settings', logado, async () => ({
      adValorem: await lerAdValoremPadrao(db),
      condicoesFtl: await lerCondicoesFtl(db),
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
      const { text } = condicoesSchema.parse(req.body);
      const antes = await lerCondicoesFtl(db);
      await db.setting.upsert({
        where: { key: CHAVES.condicoesFtl },
        create: { key: CHAVES.condicoesFtl, value: text },
        update: { value: text },
      });
      if (antes !== text) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'configuracao',
          entityId: CHAVES.condicoesFtl,
          details: { texto: { de: antes, para: text } },
        });
      }
      return { condicoesFtl: text };
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
