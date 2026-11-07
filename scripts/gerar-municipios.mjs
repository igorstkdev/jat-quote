/**
 * Gera packages/core/src/data/municipios.ts a partir da API oficial do IBGE.
 * Uso: node scripts/gerar-municipios.mjs [arquivo.json]
 * Sem arquivo, baixa de https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado
 */
import { readFileSync, writeFileSync } from 'node:fs';

const URL_IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado';
const dados = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], 'utf8'))
  : await (await fetch(URL_IBGE)).json();

const linhas = dados
  .map((m) => [m['municipio-id'], m['municipio-nome'], m['UF-sigla']])
  .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], 'pt-BR'))
  .map(([id, nome, uf]) => `${id};${nome};${uf}`);

if (linhas.length < 5500) throw new Error(`Lista incompleta: ${linhas.length} municípios`);

const hoje = new Date().toISOString().slice(0, 10);
writeFileSync(
  'packages/core/src/data/municipios.ts',
  `// GERADO por scripts/gerar-municipios.mjs em ${hoje} — não edite à mão.
// Fonte: IBGE (${URL_IBGE}). ${linhas.length} municípios. Formato: código;nome;UF
export const MUNICIPIOS_IBGE = ${JSON.stringify(linhas.join('\n'))};
`,
);
console.log(`${linhas.length} municípios gravados.`);
