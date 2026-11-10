export { D, dec, roundMoney, formatBRL } from './money.js';
export type { Dec, DecimalInput } from './money.js';
export { ErroValidacao } from './erros.js';
export {
  parseNumero,
  numeroNaoNegativo,
  arred2,
  formatNumero,
  formatPeso,
  formatPercentual,
} from './numeros.js';
export type { Entrada } from './numeros.js';
export {
  AD_VALOREM_PADRAO,
  resolverAdValoremPct,
  calcularAdValorem,
  textoCondicaoAdValorem,
} from './ad-valorem.js';
export type { Modal, AdValoremInformativo } from './ad-valorem.js';
export { calcularSpot, COMPONENTES_POR_MODAL, ROTULO_COMPONENTE } from './spot.js';
export type { ComponenteSpot, EntradaSpot, LinhaComponente, ResultadoSpot } from './spot.js';
export { calcularCubagem, FATOR_CUBAGEM, MODO_TAXADO_PADRAO } from './cubagem.js';
export type {
  ModoTaxado,
  VolumeEntrada,
  EntradaCubagem,
  VolumeResultado,
  ResultadoCubagem,
} from './cubagem.js';
export {
  calcularValorTarifa,
  cotarRota,
  normalizarIata,
  pesoTarifa,
  COMPANHIAS,
  NIVEIS_TARIFA,
  ROTULO_NIVEL,
} from './tarifa-aerea.js';
export type {
  Companhia,
  NivelTarifa,
  ValoresNivel,
  TarifaAerea,
  ValorTarifa,
  ConsultaRota,
  OpcaoRota,
} from './tarifa-aerea.js';
export { calcularFtl, KM_MINIMO_FTL, VEICULOS_FTL, ROTULO_VEICULO } from './ftl.js';
export type { VeiculoFtl, TipoLocalidade, TarifaFtl, EntradaFtl, ResultadoFtl } from './ftl.js';
export {
  UFS,
  SIGLAS_UF,
  listarMunicipios,
  buscarMunicipios,
  encontrarMunicipio,
  formatarCidade,
  normalizarTexto,
  ehUf,
} from './municipios.js';
export type { Uf, Municipio } from './municipios.js';
export {
  VALIDADE_COTACAO_DIAS,
  ROTULO_MODAL,
  formatarNumeroCotacao,
  formatarDataBR,
  dataValidade,
  textoCotacao,
  assuntoCotacao,
  linkEmailCotacao,
} from './cotacao.js';
export type { DadosTextoCotacao } from './cotacao.js';
export { destinoFtl, textoCotacaoFtl, assuntoCotacaoFtl, linkEmailCotacaoFtl } from './cotacao.js';
export type { DadosTextoFtl } from './cotacao.js';
export { SEPARADOR_CSV, lerCsv, escreverCsv, chaveCabecalho } from './csv.js';
export {
  hojeIso,
  lerData,
  dataIsoParaBR,
  validarVigencia,
  vigenciasSobrepostas,
  vigenteEm,
} from './datas.js';
export type { DataIso, Vigencia } from './datas.js';
export { taxaConversao, mesDe, mesesEntre, rotuloMes } from './indicadores.js';
