import { z } from 'zod';

/** Login do usuário: minúsculas, sem acento, de 3 a 40 caracteres. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'O usuário deve ter pelo menos 3 caracteres.')
  .max(40, 'O usuário deve ter no máximo 40 caracteres.')
  .regex(/^[a-z0-9._-]+$/, 'Use só letras sem acento, números, ponto, hífen ou sublinhado.');
