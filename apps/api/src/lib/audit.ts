import type { FastifyRequest } from 'fastify';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

export type AcaoAuditoria =
  | 'LOGIN'
  | 'LOGIN_FALHOU'
  | 'LOGIN_BLOQUEADO'
  | 'LOGOUT'
  | 'SENHA_ALTERADA'
  | 'SENHA_REDEFINIDA'
  | 'CRIAR'
  | 'EDITAR'
  | 'EXCLUIR'
  | 'DESATIVAR'
  | 'REATIVAR'
  | 'STATUS'
  | 'IMPORTAR'
  | 'EXPORTAR'
  | 'ARQUIVAR'
  | 'ATIVAR';

export type EntidadeAuditoria =
  | 'sessao'
  | 'usuario'
  | 'cliente'
  | 'cotacao'
  | 'tarifa_aerea'
  | 'tabela_ftl'
  | 'configuracao'
  | 'link';

export interface EventoAuditoria {
  action: AcaoAuditoria;
  entity: EntidadeAuditoria;
  entityId?: string | null;
  /** Qualquer dado serializável em JSON. */
  details?: unknown;
  /** Quando o evento não vem do usuário logado (ex.: falha de login). */
  userId?: string | null;
  username?: string | null;
}

type Tx = Pick<Db, 'auditLog'>;

export async function registrarAuditoria(db: Tx, req: FastifyRequest, ev: EventoAuditoria) {
  const user = req.user;
  await db.auditLog.create({
    data: {
      action: ev.action,
      entity: ev.entity,
      entityId: ev.entityId ?? null,
      ...(ev.details !== undefined ? { details: ev.details as Prisma.InputJsonValue } : {}),
      userId: ev.userId !== undefined ? ev.userId : (user?.id ?? null),
      username: ev.username !== undefined ? ev.username : (user?.username ?? null),
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    },
  });
}

/**
 * Compara dois objetos e devolve só os campos alterados: { campo: { de, para } }.
 * Campos sensíveis nunca entram no log.
 */
export function diferencas(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  ignorar: readonly string[] = ['passwordHash', 'updatedAt', 'createdAt'],
): Record<string, { de: unknown; para: unknown }> {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of Object.keys(depois)) {
    if (ignorar.includes(k)) continue;
    const a = normalizar(antes[k]);
    const d = normalizar(depois[k]);
    if (JSON.stringify(a) !== JSON.stringify(d)) out[k] = { de: a, para: d };
  }
  return out;
}

function normalizar(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === 'object' && 'toFixed' in v) return String(v);
  return v;
}
