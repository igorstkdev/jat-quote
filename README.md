# JAT Quote — Cotação de Fretes (v1.0 beta)

Sistema interno da JAT Transportes e Logística para cotação, cálculo e acompanhamento de fretes
aéreos, rodoviários e FTL Fiat. Substitui o "Spot Calculator" do Base44.

- Especificação e regras de negócio: [CLAUDE.md](CLAUDE.md)
- Fases de construção: [ROADMAP.md](ROADMAP.md)

## Estrutura

```
apps/api        API Fastify + Prisma (PostgreSQL). Em produção também entrega o site.
apps/web        Interface React + Vite + Tailwind + shadcn/ui
packages/core   Regras de cálculo puras (sem framework), 100% testadas
e2e             Testes ponta a ponta e screenshots (Playwright)
scripts         Scripts de apoio (criação do banco, backup)
```

## Pré-requisitos

- Node.js 24 ou superior (LTS) e npm 11
- PostgreSQL 16 ou superior (desenvolvido com o 18)
- Git

## Instalação

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de configuração a partir do modelo e defina uma senha para o usuário `jat`
   (só letras e números) em `DB_PASSWORD`, `DATABASE_URL` e `TEST_DATABASE_URL`:

   ```bash
   copy .env.example .env
   ```

3. Crie o usuário e os bancos no PostgreSQL. O script pede a senha do superusuário `postgres`
   (ela não é gravada):

   ```bash
   powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1
   ```

   Se o PostgreSQL não estiver em `C:\Program Files\PostgreSQL\18\bin`, informe `-PgBin "<pasta>"`.

4. Aplique as migrations:

   ```bash
   npm run db:migrate
   ```

5. (Uma vez por máquina, para os testes E2E) instale o navegador do Playwright:

   ```bash
   npx playwright install chromium
   ```

## Execução

| Comando             | O que faz                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | API (porta 3333) e site com recarga automática (http://localhost:5173) |
| `npm run build`     | Compila core, API e site                                               |
| `npm run start`     | Produção: API + site na mesma porta (`PORT`, padrão 3333)              |
| `npm test`          | Testes unitários e de integração (Vitest), usa o banco de teste        |
| `npm run test:e2e`  | Testes ponta a ponta + screenshots em `e2e/screenshots/`               |
| `npm run lint`      | ESLint                                                                 |
| `npm run typecheck` | Checagem de tipos de todos os pacotes                                  |
| `npm run format`    | Prettier                                                               |

> **Windows PowerShell:** se aparecer "a execução de scripts foi desabilitada neste sistema" ao
> rodar `npm`, use `npm.cmd` no lugar (ex.: `npm.cmd run dev`) ou rode os comandos no Prompt de
> Comando (cmd).

Em produção, com `HOST=0.0.0.0`, os operadores acessam pela rede em `http://<servidor>:<PORT>`.
A execução como serviço do Windows é configurada na Fase 6.

## Banco de dados

- `jat_quote`: banco principal.
- `jat_quote_test`: usado pelos testes. Nunca aponte `TEST_DATABASE_URL` para o banco principal.
- Migrations versionadas em `apps/api/prisma/migrations`. Nova migration: `npm run db:migrate`.

## Backup

O script de backup e restauração automático entra na Fase 6. Até lá, backup manual:

```bash
"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U jat -F c -f backups\jat_quote.dump jat_quote
```

Restauração:

```bash
"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h localhost -U jat -d jat_quote --clean backups\jat_quote.dump
```

## Regras de dinheiro

Valores monetários nunca usam ponto flutuante: `decimal.js` no core e `Decimal(14,2)` no banco.
O cálculo é feito sem arredondar e só o resultado final é arredondado para centavos com
**arredondamento comercial (meio para cima)**, o mesmo do Excel.
