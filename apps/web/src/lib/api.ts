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

/** Chamado quando a API responde 423 por licença bloqueada. Definido pelo LicencaGate. */
let aoBloquearLicenca: (() => void) | null = null;
export function definirAoBloquearLicenca(fn: (() => void) | null) {
  aoBloquearLicenca = fn;
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
  const data = (await res.json().catch(() => null)) as {
    message?: string;
    campo?: string;
    codigo?: string;
  } | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) aoPerderSessao?.();
    if (res.status === 423 && data?.codigo === 'LICENCA_BLOQUEADA') aoBloquearLicenca?.();
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

export interface LinkRastreio {
  name: string;
  url: string;
}

export interface Configuracoes {
  adValorem: { AEREO: string; RODOVIARIO: string };
  condicoesFtl: string;
  linksRastreio: LinkRastreio[];
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
  ftl: {
    uf: string | null;
    region: string;
    locality: Localidade | null;
    vehicle: VeiculoFtl | null;
    distanceKm: string | null;
    ratePerKm: string | null;
    rateVersion: number | null;
  } | null;
  duplicatedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; username: string } | null;
  updatedBy: { name: string; username: string } | null;
}

// ── Tarifas (Fase 4) ──

export type Companhia = 'GOL' | 'AZUL' | 'LATAM';
export type Nivel = 'URGENTE' | 'RAPIDO' | 'ECONOMICO';
export type Localidade = 'CAPITAL' | 'INTERIOR';
export type VeiculoFtl = 'UTILITARIO' | 'VAN' | 'TRES_QUARTOS';

export interface TarifaAerea {
  id: string;
  origin: string;
  destination: string;
  airline: Companhia;
  /** aaaa-mm-dd */
  validFrom: string;
  validTo: string | null;
  active: boolean;
  levels: Record<Nivel, { perKg: string; min: string } | null>;
  notes: string | null;
  version: number;
  /** Ativa e vigente hoje (usada na calculadora). */
  current: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpcaoCotacaoAerea {
  airline: Companhia;
  rateId: string;
  version: number;
  perKg: string;
  min: string;
  calculated: string;
  value: string;
  minimumApplied: boolean;
}

export interface TabelaFtl {
  id: string;
  uf: string;
  region: string;
  locality: Localidade;
  perKm: Record<VeiculoFtl, string>;
  adValoremPct: string;
  active: boolean;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersaoHistorico<T> {
  id: string;
  version: number;
  action: string;
  username: string | null;
  at: string;
  snapshot: T & { version: number };
}

export interface ResultadoImportacao {
  applied: boolean;
  summary: { total: number; criar: number; atualizar: number; igual: number; erros: number };
  rows: {
    linha: number;
    acao: 'criar' | 'atualizar' | 'igual' | 'erro';
    rota?: string;
    erro?: string;
  }[];
}

export interface MudancaStatus {
  id: string;
  from: StatusCotacao | null;
  to: StatusCotacao;
  note: string | null;
  at: string;
  user: string;
}

// ── Relatórios e Dashboard (Fase 5) ──

export type ModalCotacao = Cotacao['modal'];

export interface EstatisticasCotacoes {
  count: number;
  value: string;
  byStatus: { status: StatusCotacao; count: number; value: string }[];
}

export interface RelatorioSpot {
  quotes: Cotacao[];
  page: number;
  pageSize: number;
  stats: EstatisticasCotacoes;
}

export type PontoMensal = { month: string } & Record<ModalCotacao, number> &
  Record<`${ModalCotacao}_value`, string>;

export interface DadosDashboard {
  period: { from: string | null; to: string | null; today: string };
  kpis: {
    total: number;
    today: number;
    approved: number;
    declined: number;
    quotedValue: string;
    approvedValue: string;
    conversionPct: string | null;
  };
  byStatus: EstatisticasCotacoes['byStatus'];
  monthly: PontoMensal[];
  topRoutes: { route: string; ftl: boolean; count: number; value: string }[];
  recent: {
    id: string;
    at: string;
    user: string;
    from: StatusCotacao | null;
    to: StatusCotacao;
    quote: {
      id: string;
      code: string;
      modal: ModalCotacao;
      client: string | null;
      route: string;
      total: string;
    };
  }[];
}
