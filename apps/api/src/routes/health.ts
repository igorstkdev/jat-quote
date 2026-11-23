import { readFileSync } from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db.js';
import { verificarRecursosPdf } from '../lib/pdf.js';

interface DbInfo {
  version: string;
  now: Date;
}

/** Versão do sistema (apps/api/package.json), também quando roda como serviço. */
const VERSAO = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export const healthRoutes =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get('/api/health', async (_req, reply) => {
      try {
        const [info] = await db.$queryRaw<DbInfo[]>`select version() as version, now() as now`;
        const settings = await db.setting.count();
        return {
          status: 'ok',
          api: { name: 'JAT Quote API', version: VERSAO },
          database: {
            connected: true,
            version: info?.version.split(' on ')[0] ?? 'desconhecida',
            serverTime: info?.now.toISOString(),
            settings,
          },
          // Recursos do PDF (logo e Chromium): problemas aqui não derrubam o resto do sistema.
          pdf: (() => {
            const problemas = verificarRecursosPdf();
            return { ok: problemas.length === 0, problemas };
          })(),
        };
      } catch (err) {
        app.log.error({ err }, 'Falha ao consultar o banco');
        return reply.code(503).send({
          status: 'erro',
          message: 'Não foi possível conectar ao banco de dados.',
          database: { connected: false },
        });
      }
    });
  };
