/** Erro HTTP com mensagem em português pronta para o usuário. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly campo?: string,
  ) {
    super(message);
  }
}

export const naoAutenticado = () => new HttpError(401, 'Faça login para continuar.');
export const semPermissao = () => new HttpError(403, 'Você não tem permissão para esta ação.');
/** "Cotação não encontrada." / "Cliente não encontrado." (concordância pelo nome). */
const FEMININOS = new Set(['Cotação', 'Tabela', 'Tarifa']);
export const naoEncontrado = (o = 'Registro') =>
  new HttpError(404, `${o} não ${FEMININOS.has(o) ? 'encontrada' : 'encontrado'}.`);
export const conflito = (msg: string, campo?: string) => new HttpError(409, msg, campo);
export const requisicaoInvalida = (msg: string, campo?: string) => new HttpError(400, msg, campo);
