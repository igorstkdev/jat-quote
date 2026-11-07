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

5. Crie o Admin inicial, as configurações padrão e os links úteis:

   ```bash
   npm run db:seed
   ```

   O comando mostra **uma única vez** a senha temporária do usuário `admin`. Anote-a: no primeiro
   acesso o sistema exige trocar a senha. Rodar de novo não altera nada que já exista.

6. (Uma vez por máquina, para os testes E2E) instale o navegador do Playwright:

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
| `npm run test:core` | Testes do núcleo de cálculo com cobertura (exige 100%)                 |
| `npm run test:e2e`  | Testes ponta a ponta + screenshots em `e2e/screenshots/`               |
| `npm run lint`      | ESLint                                                                 |
| `npm run typecheck` | Checagem de tipos de todos os pacotes                                  |
| `npm run format`    | Prettier                                                               |

> **Windows PowerShell:** se aparecer "a execução de scripts foi desabilitada neste sistema" ao
> rodar `npm`, use `npm.cmd` no lugar (ex.: `npm.cmd run dev`) ou rode os comandos no Prompt de
> Comando (cmd).

Em produção, com `HOST=0.0.0.0`, os operadores acessam pela rede em `http://<servidor>:<PORT>`.
A execução como serviço do Windows é configurada na Fase 6.

## Cotações (Fase 3)

- **Frete Spot** (`/spot`): resultado em tempo real; o servidor recalcula tudo ao salvar. Atalhos:
  **Ctrl+S** salvar, **Ctrl+Shift+C** copiar o texto, **Ctrl+P** PDF para o cliente.
- **PDF**: duas versões, _para o cliente_ (sem custos internos, validade de 30 dias) e _da operação_
  (detalhamento com MKUP, como o app antigo). O PDF é gerado no servidor com o Chromium, que precisa
  estar instalado na máquina do servidor:

  ```bash
  npx playwright install chromium
  ```

- **Cidades**: lista oficial do IBGE embutida no sistema. Para atualizar:
  `node scripts/gerar-municipios.mjs`.
- **Cubagem** (`/cubagem`): peso taxado total = maior entre a soma dos pesos brutos e a soma dos cubados.
- Os formulários guardam um rascunho no navegador, separado por usuário.

## Acesso e segurança

- Login por usuário e senha (argon2id). A sessão expira após **12 horas sem uso** (`SESSION_TTL_HOURS`).
- **5 senhas erradas seguidas** bloqueiam o usuário por **15 minutos**; o Admin pode desbloquear redefinindo a senha.
- Senhas: mínimo de 8 caracteres, com letras e números. Usuários nunca são excluídos, apenas desativados.
- Perfis: **Admin** (tudo) e **Operacional** (cotações, tarifas, relatórios, clientes). A permissão
  "Pode editar tarifas" libera o cadastro de tarifas. Todas as permissões são checadas no servidor.
- Toda alteração fica na **Auditoria** (Administração → Auditoria), com o antes e o depois.
- Atalhos: **Ctrl+K** abre a busca de telas e ações; **Ctrl+B** recolhe o menu.

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
