const tz = 'America/Sao_Paulo';

const fData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: tz,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const fDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: tz,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** dd/mm/aaaa */
export const formatData = (iso: string | Date) => fData.format(new Date(iso));
/** dd/mm/aaaa hh:mm */
export const formatDataHora = (iso: string | Date) =>
  fDataHora.format(new Date(iso)).replace(',', '');

/** CNPJ 00.000.000/0000-00 ou CPF 000.000.000-00 */
export function formatDocumento(doc: string | null | undefined): string {
  if (!doc) return '';
  if (doc.length === 14)
    return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc;
}

/** Saudação conforme a hora em São Paulo. */
export function saudacao(agora = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: 'numeric', hour12: false }).format(
      agora,
    ),
  );
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome. */
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** Iniciais para avatar. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? '?';
  const b = partes.length > 1 ? partes[partes.length - 1]![0] : '';
  return (a + b).toUpperCase();
}
