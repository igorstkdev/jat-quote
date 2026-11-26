import { PLANOS_LICENCA } from '@jat/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { registrarAuditoria } from '../lib/audit.js';
import { conflito, HttpError, requisicaoInvalida } from '../lib/errors.js';
import {
  BLOQUEIO_ATIVACAO_MINUTOS,
  MAX_TENTATIVAS_ATIVACAO,
  type ControleLicenca,
  type EstadoLicenca,
} from '../lib/licenca.js';
import { hashParaUsuarioInexistente, verificarSenha } from '../lib/password.js';
import type { UsuarioSessao } from '../plugins/auth.js';
import { BLOQUEIO_MINUTOS, MAX_TENTATIVAS } from './auth.js';

const ativarSchema = z.object({
  usuario: z.string().trim().max(60).optional(),
  senha: z.string().max(200).optional(),
  senhaMestre: z.string().min(1, 'Informe a senha mestre de ativação.').max(200),
  plano: z.enum(PLANOS_LICENCA, { error: 'Escolha o plano.' }),
});

/** Rotas da API que funcionam com o sistema bloqueado. */
export function rotaLiberadaSemLicenca(url: string): boolean {
  const caminho = url.split('?')[0]!;
  return (
    !caminho.startsWith('/api/') ||
    caminho === '/api/health' ||
    caminho.startsWith('/api/licenca/') ||
    caminho === '/api/auth/logout'
  );
}

/** O que a tela mostra. Detalhes (plano, datas) só para Admin logado. */
function publico(e: EstadoLicenca, user: UsuarioSessao | null) {
  const base = { bloqueado: e.bloqueado, motivo: e.motivo, mensagem: e.mensagem };
  if (user?.role !== 'ADMIN' || !e.licenca) return base;
  return {
    ...base,
    plano: e.licenca.plano,
    inicio: e.licenca.inicio,
    vencimento: e.licenca.vencimento,
    ativadoPor: e.licenca.ativadoPor,
    ativadoEm: e.licenca.ativadoEm,
    diasRestantes: e.vigencia.diasRestantes,
    aviso: e.vigencia.aviso,
  };
}

export function licencaRoutes(db: Db, controle: ControleLicenca, demo = false) {
  return async (app: FastifyInstance) => {
    if (demo) {
      // Edição de demonstração (25/11/2026): sem licença; o navegador usa "demo" para a marca.
      app.get('/api/licenca/estado', async () => ({
        bloqueado: false,
        motivo: null,
        mensagem: null,
        demo: true,
      }));
      app.post('/api/licenca/ativar', async () => {
        throw requisicaoInvalida('A edição de demonstração não usa plano de vigência.');
      });
      return;
    }
    app.get('/api/licenca/estado', async (req) => publico(await controle.estado(), req.user));

    app.post(
      '/api/licenca/ativar',
      { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
      async (req) => {
        const dados = ativarSchema.parse(req.body);

        // 1) Bloqueio por excesso de senhas mestre erradas.
        const t = await controle.tentativas();
        if (t.bloqueadoAte && t.bloqueadoAte > Date.now()) {
          throw new HttpError(
            423,
            `Ativação bloqueada por excesso de tentativas. Tente novamente em ${BLOQUEIO_ATIVACAO_MINUTOS} minutos.`,
          );
        }

        // 2) Quem ativa é um Admin: o logado ou o informado (usuário + senha).
        const admin = await identificarAdmin(db, req, dados.usuario, dados.senha);

        // Vitalício não volta para um plano com prazo (17/11/2026).
        const atual = (await controle.estado()).licenca;
        if (atual?.plano === 'VITALICIO' && dados.plano !== 'VITALICIO') {
          throw conflito('O sistema já tem o plano Vitalício: não é preciso renovar.', 'plano');
        }

        // 3) Senha mestre.
        const r = await controle.ativar(dados.senhaMestre, dados.plano, admin.username);
        if (!r) {
          const falhas = t.falhas + 1;
          const bloquear = falhas >= MAX_TENTATIVAS_ATIVACAO;
          await controle.gravarTentativas(
            bloquear ? 0 : falhas,
            bloquear ? new Date(Date.now() + BLOQUEIO_ATIVACAO_MINUTOS * 60_000) : null,
          );
          await registrarAuditoria(db, req, {
            action: 'ATIVACAO_FALHOU',
            entity: 'licenca',
            userId: admin.id,
            username: admin.username,
            details: { plano: dados.plano, bloqueou: bloquear },
          });
          throw requisicaoInvalida('Senha mestre de ativação incorreta.', 'senhaMestre');
        }

        await controle.gravarTentativas(0, null);
        await registrarAuditoria(db, req, {
          action: 'ATIVAR',
          entity: 'licenca',
          userId: admin.id,
          username: admin.username,
          details: {
            plano: r.atual.plano,
            vencimento: r.atual.vencimento,
            vencimentoAnterior: r.anterior?.vencimento ?? null,
          },
        });
        return publico(await controle.estado(), { ...admin, role: 'ADMIN' } as UsuarioSessao);
      },
    );
  };
}

async function identificarAdmin(
  db: Db,
  req: Parameters<typeof registrarAuditoria>[1],
  usuario: string | undefined,
  senha: string | undefined,
): Promise<{ id: string; username: string }> {
  if (req.user?.role === 'ADMIN' && !req.user.mustChangePassword && !usuario) {
    return { id: req.user.id, username: req.user.username };
  }
  if (!usuario) throw requisicaoInvalida('Informe o usuário do Admin.', 'usuario');
  if (!senha) throw requisicaoInvalida('Informe a senha do Admin.', 'senha');

  const login = usuario.toLowerCase();
  const user = await db.user.findUnique({ where: { username: login } });
  const invalido = () => requisicaoInvalida('Usuário ou senha do Admin inválidos.', 'senha');
  if (!user) {
    await verificarSenha(await hashParaUsuarioInexistente(), senha);
    throw invalido();
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new HttpError(
      423,
      `Usuário bloqueado por excesso de tentativas. Tente novamente em ${BLOQUEIO_MINUTOS} minutos.`,
    );
  }
  const ok = await verificarSenha(user.passwordHash, senha);
  if (!ok) {
    const falhas = user.failedLoginCount + 1;
    const bloquear = falhas >= MAX_TENTATIVAS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: bloquear ? 0 : falhas,
        lockedUntil: bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000) : null,
      },
    });
    await registrarAuditoria(db, req, {
      action: 'ATIVACAO_FALHOU',
      entity: 'licenca',
      userId: user.id,
      username: user.username,
      details: { motivo: 'senha_admin_incorreta' },
    });
    throw invalido();
  }
  if (!user.active) throw new HttpError(403, 'Usuário desativado.');
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Somente um Admin pode ativar o sistema.');
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  return { id: user.id, username: user.username };
}
