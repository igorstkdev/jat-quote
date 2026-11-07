/** Erro de API com mensagem já em português, pronta para mostrar ao usuário. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'include', ...init });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique a rede.', 0);
  }
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) {
    throw new ApiError(body?.message ?? `Erro ${res.status} no servidor.`, res.status);
  }
  return body as T;
}

export interface HealthResponse {
  status: 'ok';
  api: { name: string; version: string };
  database: { connected: true; version: string; serverTime: string; settings: number };
}
