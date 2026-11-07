/** Erro de API com mensagem já em português, pronta para mostrar ao usuário. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly campo?: string,
  ) {
    super(message);
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Chamado quando a API responde 401 (sessão expirada). Definido pelo AuthProvider. */
let aoPerderSessao: (() => void) | null = null;
export function definirAoPerderSessao(fn: (() => void) | null) {
  aoPerderSessao = fn;
}

async function request<T>(metodo: Metodo, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: metodo,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        // Exigido pela API em toda alteração (proteção anti-CSRF).
        ...(metodo !== 'GET' ? { 'X-JAT-Requested': '1' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique a rede.', 0);
  }
  const data = (await res.json().catch(() => null)) as { message?: string; campo?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) aoPerderSessao?.();
    if (!data?.message && [502, 503, 504].includes(res.status)) {
      throw new ApiError(
        'A API não está respondendo. Verifique se o servidor está ligado.',
        res.status,
      );
    }
    throw new ApiError(data?.message ?? `Erro ${res.status} no servidor.`, res.status, data?.campo);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Compatibilidade com a página de status (Fase 0). */
export const apiGet = api.get;

export interface HealthResponse {
  status: 'ok';
  api: { name: string; version: string };
  database: { connected: true; version: string; serverTime: string; settings: number };
}

// ── Tipos da API ──

export type Role = 'ADMIN' | 'OPERACIONAL';

export interface UsuarioSessao {
  id: string;
  username: string;
  name: string;
  role: Role;
  canEditRates: boolean;
  mustChangePassword: boolean;
}

export interface Usuario extends Omit<UsuarioSessao, 'mustChangePassword'> {
  active: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Cliente {
  id: string;
  name: string;
  document: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LinkUtil {
  id: string;
  name: string;
  url: string;
  sortOrder: number;
  active: boolean;
}

export interface Configuracoes {
  adValorem: { AEREO: string; RODOVIARIO: string };
  condicoesFtl: string;
}

export interface RegistroAuditoria {
  id: string;
  at: string;
  userId: string | null;
  username: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: unknown;
  ip: string | null;
}

export type StatusCotacao = 'PENDENTE' | 'APROVADA' | 'DECLINADA' | 'RECUSADA';
export type ComponenteSpot = 'RODOVIARIO' | 'COLETA' | 'AEREO' | 'ENTREGA';

export interface Cotacao {
  id: string;
  number: number;
  code: string;
  modal: 'AEREO' | 'RODOVIARIO' | 'FTL';
  status: StatusCotacao;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  origin: string | null;
  originCity: string | null;
  originUf: string | null;
  dest: string | null;
  destCity: string | null;
  destUf: string | null;
  costs: Record<ComponenteSpot, string | null>;
  toll: string;
  markupPct: string;
  adValoremPct: string;
  goodsValue: string | null;
  costTotal: string;
  markupTotal: string;
  subtotal: string;
  total: string;
  notes: string | null;
  duplicatedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; username: string } | null;
  updatedBy: { name: string; username: string } | null;
}
