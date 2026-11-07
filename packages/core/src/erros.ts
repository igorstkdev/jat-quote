/**
 * Erro de validação de regra de negócio, com mensagem em português pronta para
 * mostrar ao usuário e o nome do campo que causou o problema.
 */
export class ErroValidacao extends Error {
  override readonly name = 'ErroValidacao';

  constructor(
    public readonly campo: string,
    message: string,
  ) {
    super(message);
  }
}
