import { z } from 'zod';

// Carrega o .env da raiz do monorepo. Funciona tanto em src/ quanto em dist/.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* sem .env: usa variáveis de ambiente do sistema */
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.url({ error: 'DATABASE_URL ausente ou inválida no .env' }),
  SESSION_TTL_HOURS: z.coerce.number().min(1).max(168).default(12),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  /** Só com NODE_ENV=test (E2E): chave pública de teste da licença. Ignorada em produção. */
  LICENCA_CHAVE_TESTE: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${problems.join('\n')}\nVeja o .env.example.`);
  }
  return parsed.data;
}
