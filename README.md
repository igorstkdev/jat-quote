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
scripts         Instalação, serviço, backup e restauração (PowerShell)
```

## Instalação no servidor (produção)

Só o servidor recebe instalação; os operadores usam o navegador. Tudo é gratuito.

**1. Instale os pré-requisitos** (uma vez):

- **Node.js LTS** (24 ou superior): https://nodejs.org. Use o instalador padrão.
- **PostgreSQL** (16 ou superior): https://www.postgresql.org/download/windows/. Anote a senha do
  usuário `postgres` que você definir.

**2. Copie a pasta do sistema para o servidor**, por exemplo `C:\JAT\jat-quote`, sem as pastas
`node_modules` (ou faça `git clone` do repositório).

**3. Rode o instalador** no PowerShell **como Administrador**, dentro da pasta:

```bash
powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
```

O instalador faz tudo e pode ser rodado de novo com segurança:

1. confere Node.js, npm e PostgreSQL;
2. cria o `.env` de produção, com uma senha aleatória para o banco;
3. cria o usuário e o banco no PostgreSQL (pede a senha do `postgres`, que não é gravada);
4. instala as dependências e compila;
5. aplica as migrations;
6. instala o Chromium usado nos PDFs (na pasta `.navegadores` do sistema);
7. cria o **Admin inicial**: pergunta o login (Enter = `admin`) e mostra a **senha temporária uma
   única vez**. No primeiro acesso o sistema exige trocá-la;
8. registra o sistema para **iniciar com o Windows** (tarefa "JAT Quote" do Agendador de Tarefas,
   como SYSTEM, mesmo sem ninguém logado), agenda o **backup diário às 23h** (tarefa
   "JAT Quote - Backup") e libera a porta **3333** no Firewall **só para a rede local**;
9. inicia o sistema e mostra o endereço de acesso.

Opções: `-AdminUsuario maria.souza`, `-Porta 3333`, `-PastaBackup "D:\Backups\JAT"`,
`-HoraBackup 23:00`, `-PgBin "C:\Program Files\PostgreSQL\18\bin"`. Para instalar numa máquina
que também tem o ambiente de desenvolvimento, use outra porta e outros nomes no PostgreSQL, para
não misturar os dois: `-Porta 3334 -Banco jat_quote_local -UsuarioBanco jat_local`.

**4. Acesse** pelo navegador de qualquer máquina da rede: `http://<nome-do-servidor>:3333` (o
instalador mostra o nome e o IP). Entre com o Admin, troque a senha e cadastre os usuários.

### No dia a dia do servidor

PowerShell como Administrador, na pasta do sistema
(`powershell -ExecutionPolicy Bypass -File scripts\<script>.ps1 ...`):

| Script e opção                | O que faz                                   |
| ----------------------------- | ------------------------------------------- |
| `servico.ps1 -Acao status`    | Mostra se está no ar e o endereço de acesso |
| `servico.ps1 -Acao reiniciar` | Reinicia o sistema                          |
| `servico.ps1 -Acao parar`     | Para o sistema (volta sozinho ao religar)   |
| `servico.ps1 -Acao remover`   | Remove as tarefas e a regra do Firewall     |
| `atualizar.ps1`               | Aplica uma nova versão (veja abaixo)        |

- Se o sistema cair, ele é reiniciado sozinho em poucos segundos.
- Logs em `logs\`: `jat-quote.log` (sistema; renovado a cada 10 MB, ficam 5), `servico.log`
  (inícios e quedas), `backup.log` e `instalacao.log`.

### Atualizar para uma nova versão

1. Copie os arquivos da nova versão por cima da pasta do sistema (mantenha o `.env`, `backups\` e
   `logs\`). Se a pasta for um repositório git, o script baixa sozinho com `git pull`.
2. Rode, como Administrador:

   ```bash
   powershell -ExecutionPolicy Bypass -File scripts\atualizar.ps1
   ```

   Ele faz backup do banco (sufixo `antes-atualizacao`), para o sistema, instala, compila, aplica
   as migrations, atualiza o Chromium e inicia de novo, conferindo se respondeu. Se algo falhar,
   ele tenta subir o sistema de novo e o backup fica disponível para restaurar.

## Backup e restauração

- **Automático**: todo dia às 23h (tarefa "JAT Quote - Backup"), guardando as **30 cópias** mais
  recentes em `backups\` (ou na pasta de `BACKUP_DIR` no `.env`; a quantidade fica em
  `BACKUP_KEEP`). Cada cópia é conferida depois de criada.
- **Guarde uma cópia fora do servidor**: aponte `BACKUP_DIR` para outro disco ou copie a pasta
  para a rede ou um HD externo com frequência. Backup só no mesmo disco não protege contra defeito
  no disco. Para gravar direto numa pasta da rede, a tarefa de backup precisa rodar com um usuário
  que tenha acesso a ela (Agendador de Tarefas → "JAT Quote - Backup" → Propriedades → Alterar
  usuário).
- **Backup manual** (antes de algo arriscado):

  ```bash
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
  ```

- **Restaurar** (lista os backups e pede para digitar RESTAURAR):

  ```bash
  powershell -ExecutionPolicy Bypass -File scripts\restaurar.ps1
  ```

  Antes de restaurar, ele faz um backup do estado atual (sufixo `antes-restauracao`), para que dê
  para voltar atrás. O sistema é parado durante a restauração e iniciado de novo no fim.

## Migração do Base44

As cotações antigas **não** são migradas: o JAT Quote começa em `JQ-000001`. Entram só os
cadastros, cada um pela própria tela, em **duas etapas**: o sistema mostra uma **prévia** com o
resultado de cada linha e só grava depois da confirmação. Com qualquer erro, nada é gravado.

1. **Clientes** (Clientes → Importar CSV, só Admin). Colunas: `Nome` (obrigatória), `CNPJ/CPF`,
   `Contato`, `E-mail`, `Telefone`, `Observações`, `Status` (Ativo/Inativo). Também são aceitos
   nomes comuns de outras exportações (ex.: `Cliente`, `CNPJ`, `Email`, `Fone`).
2. **Tarifas aéreas** (Tarifas Aéreas → Importar CSV), no layout do app antigo.
3. **Tabelas FTL** (FTL Fiat → Tabelas de Preço → Importar CSV).

- Separador `;` ou `,` (detectado sozinho); arquivo em UTF-8 ou no padrão do Excel do Windows.
- **Relatório de inconsistências**: na prévia, o botão "Baixar relatório" gera um CSV com cada
  linha do arquivo (o número é o mesmo que aparece no Excel), o resultado (novo, atualiza, sem
  alteração ou erro) e o problema. Corrija o arquivo e importe de novo.
- Pode importar o mesmo arquivo mais de uma vez: o que já existe é atualizado, nunca duplicado.
- Toda importação fica registrada na auditoria.

## Solução de problemas

- **"A API não está respondendo"**: rode `servico.ps1 -Acao status`. Se não estiver no ar,
  `-Acao reiniciar` e veja `logs\jat-quote.log`.
- **No servidor abre, mas nas outras máquinas não**: confira a regra "JAT Quote (porta 3333)" no
  Firewall do Windows e se a rede do servidor está como **Privada** ou de **Domínio** (a regra não
  vale para rede Pública).
- **PDF não gera**: rode o instalador de novo (a etapa 6 reinstala o Chromium).
- **Esqueceu a senha do Admin**: veja "Acesso e segurança".
- **Backup falhou**: veja `logs\backup.log`; confira o espaço em disco e o acesso à pasta de
  `BACKUP_DIR`.

## Ambiente de desenvolvimento

Pré-requisitos: Node.js 24+ (npm 11), PostgreSQL 16+ (desenvolvido com o 18) e Git.

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

   O comando mostra **uma única vez** a senha temporária do usuário `admin` (para outro login:
   `npm run db:seed -- maria.souza`). No primeiro acesso o sistema exige trocar a senha. Rodar de
   novo não altera nada que já exista.

6. (Uma vez por máquina, para os testes E2E) instale o navegador do Playwright:

   ```bash
   npx playwright install chromium
   ```

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

Checklist de testes manuais para os operadores: [CHECKLIST.md](CHECKLIST.md).

## Cotações

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

## Tarifas e FTL

- **Tarifas Aéreas** (`/tarifas-aereas`): cadastro por rota (IATA) e companhia, com vigência
  (data final opcional), três níveis opcionais (Urgente, Rápido, Econômico) e histórico de versões.
  Vigências sobrepostas da mesma rota e companhia são recusadas pelo servidor.
- **Calculadora rápida**: usa só tarifas ativas e vigentes hoje e lista as companhias do menor para
  o maior custo. "Usar no Frete Spot" leva o valor para o Custo Aéreo; "Usar peso da Cubagem" traz o
  peso taxado aéreo da cubagem em andamento.
- **FTL Fiat** (`/ftl`): abas Calculadora, Tabelas de Preço e Relatório. Só uma tabela ativa por UF
  e tipo de localidade; a cotação FTL não tem cliente e bloqueia rotas abaixo de 25 km.
- **CSV**: separado por ponto e vírgula, no layout do app antigo. A importação mostra uma prévia
  com os erros por linha e só grava após a confirmação (com erro, nada é gravado). Linha com a mesma
  chave de um cadastro existente atualiza esse cadastro (nova versão).
- **Excluir tudo** (somente Admin, digitando `EXCLUIR TUDO`): arquiva os cadastros. Eles somem das
  telas, mas o histórico e a auditoria continuam no banco.
- Cadastrar ou alterar tarifas exige ser Admin ou ter a permissão "Pode editar tarifas".
- **Status das cotações**: qualquer usuário muda o status de uma cotação que não está Aprovada;
  tirar uma cotação de Aprovada é só do Admin. Cada mudança fica registrada.
- Os links de rastreio (Gollog, Azul Cargo) são editados em Administração → Configurações.

## Relatório e Dashboard

- **Relatório Spot** (`/relatorios`): filtros combináveis (nº da cotação, cliente, origem ou
  destino; período; status; modal) guardados no endereço da página, então o link pode ser
  compartilhado. Mostra quantidade e valor no total e por status (clique num status para filtrar).
- Por cotação: **Visão cliente** (sem custos internos) e **Visão operação** (componentes com MKUP),
  alterar status, editar no Frete Spot (bloqueado se Aprovada), duplicar como nova, PDF e, só para o
  Admin, **excluir**. A exclusão tira a cotação das telas, mas ela continua no banco e na auditoria.
- **Exportar Excel**: as cotações filtradas, com cabeçalho formatado, valores numéricos em R$,
  linha de totais e uma aba "Resumo" com os filtros e os totais por status. É de uso interno
  (inclui custos e markup). Cada exportação fica registrada na auditoria.
- **Dashboard** (`/dashboard`): Spot e FTL juntos, com filtro de período (padrão: últimos 12 meses)
  e de modal. KPIs: total de cotações, cotações hoje, aprovadas, valor cotado, valor aprovado e
  **conversão = Aprovadas ÷ (Aprovadas + Declinadas)** (Recusadas e Pendentes não entram).
  Gráficos: volume mensal por modal (quantidade ou valor), distribuição por status, Top 10 rotas
  (por quantidade de cotações) e atividade recente.
- O período usa a **data de criação** da cotação, no fuso de São Paulo.

## Acesso e segurança

- Login por usuário e senha (argon2id). A sessão expira após **12 horas sem uso** (`SESSION_TTL_HOURS`).
- **5 senhas erradas seguidas** bloqueiam o usuário por **15 minutos**; o Admin pode desbloquear redefinindo a senha.
- Senhas: mínimo de 8 caracteres, com letras e números. Usuários nunca são excluídos, apenas desativados.
- Perfis: **Admin** (tudo) e **Operacional** (cotações, tarifas, relatórios, clientes). A permissão
  "Pode editar tarifas" libera o cadastro de tarifas. Todas as permissões são checadas no servidor.
- **Esqueceu a senha do Admin?** No servidor, na pasta do sistema, rode
  `npm.cmd run admin:recuperar-acesso` (usuário `admin`) ou `npm run admin:recuperar-acesso -- <usuário>` para outro Admin. O comando mostra uma
  senha temporária uma única vez, exige a troca no próximo acesso, desbloqueia o usuário, encerra as
  sessões abertas e registra na auditoria. A senha de usuários Operacionais é redefinida pelo Admin.
- Toda alteração fica na **Auditoria** (Administração → Auditoria), com o antes e o depois.
- Atalhos: **Ctrl+K** abre a busca de telas e ações; **Ctrl+B** recolhe o menu.

## Banco de dados

- `jat_quote`: banco principal.
- `jat_quote_test`: usado pelos testes. Nunca aponte `TEST_DATABASE_URL` para o banco principal.
- Migrations versionadas em `apps/api/prisma/migrations`. Nova migration: `npm run db:migrate`.

## Regras de dinheiro

Valores monetários nunca usam ponto flutuante: `decimal.js` no core e `Decimal(14,2)` no banco.
O cálculo é feito sem arredondar e só o resultado final é arredondado para centavos com
**arredondamento comercial (meio para cima)**, o mesmo do Excel.
