# JAT Quote — Roadmap v1.0 beta

Cada fase termina com: testes passando, commit, resumo e **parada para validação**.

## Fase 0 — Fundação

- Monorepo (`apps/api`, `apps/web`, `packages/core`), TypeScript strict, ESLint e Prettier.
- Fastify + Prisma conectados ao PostgreSQL local; `.env.example`.
- Vite + React + Tailwind + shadcn/ui; tokens de tema claro/escuro.
- Vitest e Playwright configurados; scripts `npm run dev`, `test`, `build`.
- **Entrega:** "olá mundo" de ponta a ponta (página chamando a API, que lê o banco).

## Fase 1 — Núcleo de cálculo (`packages/core`)

- Funções puras: frete spot, cubagem, tarifa aérea, FTL e ad valorem informativo.
- Golden tests do `CLAUDE.md` + casos de borda (zeros, negativos, campos vazios, arredondamento).
- **Entrega:** relatório de testes 100% verde.

## Fase 2 — Acesso e estrutura

- Modelo de dados completo (Prisma) e migrations.
- Login, sessão, perfis Admin/Operacional, permissão "Pode editar tarifas", auditoria.
- Layout principal: sidebar, cabeçalho, paleta de comandos, tema.
- Gestão de usuários e clientes (com soft delete).
- Seed: usuário admin inicial (senha forçada a trocar no primeiro acesso).

## Fase 3 — Calculadoras

- Frete Spot completo (salvar, editar, limpar, rascunho local, copiar, e-mail, PDF).
- Cálculo de Cubagem.
- **Entrega:** screenshots claro/escuro para validação visual.

## Fase 4 — Tarifas

- Tarifas aéreas: CRUD, vigência, histórico, duplicar, ativar/desativar, CSV, calculadora rápida.
- FTL Fiat: tabela, calculadora, histórico de cotações, CSV.

## Fase 5 — Relatórios e Dashboard

- Relatório Spot com filtros, estatísticas, Visão Cliente/Operação, alteração de status, exportação Excel.
- Dashboard com KPIs, gráficos e atividade recente.

## Fase 6 — Migração e entrega beta

- Importador dos CSVs exportados do Base44 (clientes, cotações, tarifas aéreas, FTL), com relatório de inconsistências.
- Script de backup/restauração do PostgreSQL.
- Execução como serviço no servidor da rede; acesso pelos operadores via `http://<servidor>:<porta>`.
- `README.md` final + checklist de testes manuais para os operadores.
