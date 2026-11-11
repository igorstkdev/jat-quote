import { chaveCabecalho, escreverCsv } from '@jat/core';
import type { Client } from '../generated/prisma/client.js';

/** Colunas do CSV de clientes (exportação e importação). */
export const CABECALHO_CSV_CLIENTES = [
  'Nome',
  'CNPJ/CPF',
  'Contato',
  'E-mail',
  'Telefone',
  'Observações',
  'Status',
] as const;

/** Nomes alternativos aceitos na importação (ex.: exportações do Base44 ou de outros sistemas). */
const APELIDOS: Record<string, readonly string[]> = {
  Nome: ['Nome', 'Cliente', 'Razão Social', 'Name'],
  'CNPJ/CPF': ['CNPJ/CPF', 'CNPJ', 'CPF', 'Documento', 'CPF/CNPJ'],
  Contato: ['Contato', 'Responsável', 'Contact'],
  'E-mail': ['E-mail', 'Email', 'E-mail de contato'],
  Telefone: ['Telefone', 'Fone', 'Celular', 'Phone'],
  Observações: ['Observações', 'Observacoes', 'Obs', 'Notas', 'Notes'],
  Status: ['Status', 'Situação', 'Ativo'],
};

/** Coluna "Nome" com qualquer um dos apelidos. */
export function temColunaNome(cabecalho: readonly string[]): boolean {
  const chaves = cabecalho.map(chaveCabecalho);
  return APELIDOS.Nome!.some((a) => chaves.includes(chaveCabecalho(a)));
}

/** Lê uma coluna pelo nome padrão ou por um dos apelidos (primeiro valor não vazio). */
export function campoCliente(get: (c: string) => string, coluna: keyof typeof APELIDOS): string {
  for (const a of APELIDOS[coluna] ?? [coluna]) {
    const v = get(a);
    if (v) return v;
  }
  return '';
}

/** "Ativo", "Inativo", "Sim", "Não", vazio (= ativo). Valor desconhecido → null. */
export function lerAtivo(v: string): boolean | null {
  const t = chaveCabecalho(v);
  if (['', 'ativo', 'ativa', 'sim', 's', 'true', '1', 'active'].includes(t)) return true;
  if (['inativo', 'inativa', 'nao', 'n', 'false', '0', 'inactive', 'desativado'].includes(t)) {
    return false;
  }
  return null;
}

export function csvClientes(clientes: readonly Client[]): string {
  return (
    '\uFEFF' +
    escreverCsv([
      [...CABECALHO_CSV_CLIENTES],
      ...clientes.map((c) => [
        c.name,
        c.document ?? '',
        c.contact ?? '',
        c.email ?? '',
        c.phone ?? '',
        c.notes ?? '',
        c.active ? 'Ativo' : 'Inativo',
      ]),
    ])
  );
}
