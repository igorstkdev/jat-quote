import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { popularDemo } from '../lib/demo.js';
import { requisicaoInvalida } from '../lib/errors.js';
import { COOKIE_SESSAO, exigir } from '../plugins/auth.js';

export const FRASE_RESTAURAR_DEMO = 'RESTAURAR DEMO';
const restaurarBody = z.object({ confirmation: z.string() });

/** Só existe na edição de demonstração: "Restaurar demo" (Admin) recria os dados fictícios. */
export function demoRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    app.post('/api/demo/restaurar', { preHandler: exigir({ admin: true }) }, async (req, reply) => {
      const { confirmation } = restaurarBody.parse(req.body);
      if (confirmation.trim().toUpperCase() !== FRASE_RESTAURAR_DEMO) {
        throw requisicaoInvalida(`Digite ${FRASE_RESTAURAR_DEMO} para confirmar.`, 'confirmation');
      }
      const { cotacoes } = await popularDemo(db);
      // As sessões foram apagadas junto com os dados: o navegador volta para o login.
      reply.clearCookie(COOKIE_SESSAO, { path: '/' });
      return { status: 'ok', cotacoes };
    });
  };
}
