# JAT Quote — Contexto do Projeto (v1.1.1)

> Este arquivo é lido automaticamente pelo Claude Code em toda sessão. Ele é a fonte única de verdade do projeto.
> Atualize-o sempre que uma regra de negócio for confirmada ou alterada.

## 1. O que é

**JAT Quote — Cotação de Fretes** é o sistema interno da JAT Transportes e Logística para cotação, cálculo e acompanhamento de fretes aéreos e rodoviários (incluindo FTL Fiat). Ele substitui o app "Spot Calculator" feito no Base44 (https://calculadora-de-frete-spot-jat.base44.app), que deixará de ser usado.

- Uso: **interno, multiusuário, rede local da empresa**. Um servidor roda na rede e os operadores acessam pelo navegador.
- Idioma da interface: **português brasileiro**. Moeda: BRL (`R$ 1.234,56`). Datas: `dd/mm/aaaa`. Fuso: America/Sao_Paulo.
- Público: operadores logísticos (perfil Operacional) e gestores (perfil Admin).

## 2. Stack obrigatória

| Camada            | Tecnologia                                                                             |
| ----------------- | -------------------------------------------------------------------------------------- |
| Linguagem         | TypeScript em todo o projeto (strict)                                                  |
| Estrutura         | Monorepo com npm workspaces: `apps/api`, `apps/web`, `packages/core`                   |
| Regras de negócio | `packages/core`: funções puras de cálculo, sem dependência de framework, 100% testadas |
| Backend           | Node.js LTS + Fastify + Zod (validação)                                                |
| Banco             | PostgreSQL + Prisma (migrations versionadas)                                           |
| Autenticação      | Sessão via cookie httpOnly + senhas com **argon2** (nunca SHA-256)                     |
| Frontend          | React + Vite + Tailwind CSS + shadcn/ui + TanStack Query + TanStack Table              |
| Gráficos          | Recharts                                                                               |
| Animações         | Framer Motion (sutis, nunca atrapalham a operação)                                     |
| Exportações       | ExcelJS (.xlsx), geração de PDF no servidor, CSV para tarifas                          |
| Testes            | Vitest (unitários e integração) + Playwright (E2E e screenshots da interface)          |

Não troque nenhuma peça da stack sem me perguntar antes.

## 3. Regras de negócio (validadas no app atual em 05/11/2026)

O **app em produção é a referência**, não a documentação antiga. Onde houver dúvida, pergunte antes de implementar.

### 3.1 Frete Spot

- Campos: Cliente (obrigatório), Cidade/UF de origem, Cidade/UF de destino, Tipo de transporte (Aéreo | Rodoviário), custos, Pedágio, Markup %, Ad valorem %, Observações.
- **Rodoviário**: campo único "Custo Rodoviário (R$)".
- **Aéreo** (confirmado em 07/11/2026): três campos, "Custo de Coleta (R$)", "Custo Aéreo (R$)" e "Custo de Entrega (R$)". Pedágio também se aplica ao aéreo.
- Fórmulas:
  - `Subtotal = SomaDosCustos × (1 + Markup% / 100)`
  - `Total = Subtotal + Pedágio` (pedágio não recebe markup)
  - O markup é exibido também por componente: `Componente × (1 + Markup%/100)`.
  - O painel de resultado mostra: Total do Frete (destaque), Pedágio, "Total Final" e um expansor "Detalhar Custos com MKUP" com os componentes, o "MKUP Total Aplicado" (= Subtotal − SomaDosCustos) e o "Subtotal com MKUP". **Desde 22/11/2026 MKUP e Subtotal ficam só dentro do expansor (fechado por padrão)**: o operador costuma mandar um print da prévia ao cliente, e esses valores são internos.
  - Exemplos reais do app atual: Rodoviário 350 + pedágio 150, markup 70% → MKUP 245, subtotal 595, total **745,00**. Aéreo 300 + 600 + 150, pedágio 150, markup 70% → MKUP 735, subtotal 1.785, total **1.935,00**.
- **Markup negativo não é permitido** (confirmado em 07/11/2026): erro "O markup não pode ser negativo." Custos e pedágio também não aceitam negativos; campo vazio vale 0.
- **Ad valorem é APENAS INFORMATIVO**: não entra em nenhuma soma (total, dashboard, relatórios, Excel). Padrão **por modal: Aéreo 0,47% e Rodoviário 0,15%** (padrões configuráveis pelo Admin), editável por cotação; campo em branco = usa o padrão do modal. Aparece no PDF e no texto copiado como condição comercial: _"Ad valorem de X% sobre o valor da nota fiscal, cobrado adicionalmente."_
- Campo opcional "Valor estimado da mercadoria": se preenchido, mostra a estimativa do ad valorem como informativa, fora do total.
- **Termos e condições Spot** (17/11/2026): um conjunto **por modal** (Rodoviário e Aéreo), em Configurações → Condições Spot. O Admin escolhe o formato de cada um: **tópicos** (lista com •, reordenável) ou **texto livre**. Aéreo vem com os 7 tópicos de referência; Rodoviário começa vazio. Aparecem na prévia (abaixo dos valores, letra menor), nos **dois PDFs**, no Copiar e no e-mail. **Ficam gravados na cotação ao salvar** (mudar as Configurações não altera cotações já salvas; "Duplicar como nova" pega os atuais).
- **Prévia da cotação**: logo da JAT no canto superior direito; status junto dos selos (modal, ad valorem); **Observações** num quadro discreto abaixo dos termos, atualizado enquanto digita.
- Ações: Salvar (status inicial "Pendente"), Editar, Limpar, PDF, Copiar (texto formatado para WhatsApp/e-mail), Enviar e-mail (`mailto:` com assunto e corpo preenchidos).
- Rascunho do formulário persistido localmente para não perder dados ao recarregar.
- Cotações têm **número sequencial legível** (ex.: `JQ-000123`), **uma sequência única** para Spot e FTL, com o modal como campo.
- **Cotação Aprovada não pode ser editada.** Para corrigir: o Admin volta o status (registrado na auditoria) ou usa "Duplicar como nova cotação".
- Rascunho local é guardado **por usuário**.
- **Validade da cotação: 30 dias** (aparece no PDF e no texto copiado). Confirmado em 07/11/2026.
- **Cidades de origem/destino: lista oficial do IBGE** (autocompletar, sem internet), sempre "Cidade, UF".
- **Qualquer usuário pode editar cotação de outro** (exceto Aprovada); toda edição vai para a auditoria.
- PDF do app atual (referência, 07/11/2026): título, ROTA "Cidade, UF -> Cidade, UF", data/hora, "Detalhamento dos Custos (MKUP Individual)" com, por componente, Custo base / + MKUP (x%) / Total com MKUP; depois MKUP Total Aplicado, Subtotal com MKUP, Pedágio e TOTAL DO FRETE. Não mostra cliente nem validade. Ou seja, é uma **visão da operação**.
- **PDF que vai para o cliente = versão SEM custos internos** (confirmado em 07/11/2026): número, data, cliente, rota, modal, valor do frete, ad valorem e validade de 30 dias. A versão "da operação" (com custo base e MKUP por componente, igual ao app atual) é só para uso interno.

### 3.2 Cubagem

- Dimensões em **metros**, peso em kg.
- Fatores: **Aéreo = 166,667 kg/m³** e **Rodoviário = 300 kg/m³**.
- Por volume: `PesoCubado = C × L × A × Fator`; `PesoTaxado = MAX(PesoBruto, PesoCubado)`.
- Totais: somas de peso bruto, peso cubado e peso taxado.
- **Quantidade por volume** (novo; o app atual não tem): peso bruto informado **por unidade**; taxado da linha = `MAX(bruto, cubado)` por unidade × quantidade.
- **Peso Taxado Total = "por embarque" = `MAX(Σ bruto, Σ cubado)`** (confirmado em 07/11/2026 com o app atual, nos dois modais). O detalhe de cada volume continua mostrando o taxado da linha. O modo "por volume" (Σ dos taxados das linhas) existe no core como configuração, mas não é o padrão.
- Exemplos reais com vários volumes: rodoviário 0,5×0,8×1,2 m 200 kg + 0,2×0,4×0,45 m 3 kg → bruto **203,00**, cubado **154,80**, taxado **203,00**. Aéreo, os mesmos + 0,5×0,45×0,45 m 4 kg → cubados 80,00 / 6,00 / **16,88**, bruto **207,00**, cubado **102,88**, taxado **207,00**.
- Funcionalidades: múltiplos volumes, adicionar, remover, duplicar, quantidade por volume.
- Exemplos reais do app atual (rodoviário, 1 volume): 0,4 × 0,3 × 0,3 m, 3 kg → cubado **10,80 kg**, taxado **10,80 kg**; 0,5 × 0,8 × 1,2 m, 200 kg → cubado **144,00 kg**, taxado **200,00 kg**.
- Pesos exibidos no padrão brasileiro (`10,80 kg`), com 2 casas.

### 3.3 Tarifas aéreas

- Chave: aeroporto de origem (IATA, 3 letras), aeroporto de destino (IATA) e companhia (GOL | AZUL | LATAM).
- Níveis: Urgente, Rápido e Econômico, cada um com tarifa/kg e mínimo. **Os 3 níveis são opcionais** por tarifa.
- `Valor = MAX(Peso × Tarifa/kg, Mínimo)`. O peso é usado **como digitado** (sem arredondar para o kg inteiro), confirmado em 07/11/2026.
- Calculadora rápida: origem + destino + nível + peso taxado → lista todas as companhias da rota, **ordenadas pelo menor custo**. Botão Limpar; estado vazio "Aguardando cálculo".
- Gestão: criar com vigência (início/fim), editar (gera histórico automático), ativar/desativar, duplicar, importar/exportar CSV, histórico completo por tarifa.
- **Vigências sobrepostas são proibidas** (mesma rota + companhia), validado no servidor.
- Tela do app atual (referência): cartões com Total de Tarifas e totais por companhia (GOL, AZUL, LATAM); "Links de Rastreio" (Rastreio Gollog, Rastreio Azul Cargo); tabela com busca por aeroporto/CIA, filtro de status, colunas Rota, CIA, Urgente, Rápido, Econômico, Status, Versão e Ações; botões Importar CSV, Exportar CSV, Nova Tarifa e "Excluir Tudo" (somente Admin, com confirmação forte).
- Decisões de 08/11/2026:
  - **Vigência: data final opcional** (sem data final = vale até ser substituída). A calculadora usa só tarifas **ativas e vigentes na data de hoje**.
  - **"Excluir Tudo" = arquivar**: as tarifas somem das telas e da calculadora, mas histórico e auditoria continuam no banco.
  - **Links de rastreio** (editáveis pelo Admin em Configurações): Rastreio Gollog https://servicos.gollog.com.br/app/site/tracking e Rastreio Azul Cargo https://www.azullogistica.com.br/Rastreio.
  - **Layout do CSV = o do app atual**: separador `;`, colunas `Origem;Destino;Companhia;Urgente R$/Kg;Urgente Min;Rápido R$/Kg;Rápido Min;Econômico R$/Kg;Econômico Min;Status;Versão;Vigência Início;Vigência Fim;Observações`. A tarifa tem um campo Observações.
  - Integrações: na calculadora rápida, "Usar no Frete Spot" (preenche o Custo Aéreo com a opção escolhida) e "Usar peso da Cubagem".

### 3.4 FTL Fiat

- Tabela: UF destino, Região, Tipo de localidade (Capital | Interior), R$/km para Utilitário, VAN e 1.5T, e Ad valorem %.
- `Frete = Distância (km) × Tarifa/km do veículo`. Ad valorem informativo, fora do total.
- Distância em km **digitada pelo operador** na v1 (Google Maps automático fica para versão futura).
- **Sem pedágio e sem markup no FTL** (confirmado em 07/11/2026 com o app atual).
- Exemplo real: SP Capital, VAN R$ 3,60/km, 300 km → **R$ 1.080,00**; ad valorem 0,5% (da tabela), informativo.
- **KM da rota mínimo 25 km**: abaixo disso o sistema **bloqueia** com a mensagem "KM da rota: mínimo 25 km." (confirmado em 07/11/2026).
- **Condições comerciais do FTL**: editáveis pelo Admin em Configurações → Condições FTL, **uma por veículo** (Utilitário, VAN, 1.5T — 17/11/2026), em tópicos ou texto livre (padrão: texto livre, com o texto antigo). Aparecem no resultado, no PDF, no "Copiar" e no e-mail, e ficam gravadas na cotação ao salvar.
- Módulo com 3 abas (referência do app atual):
  - **Calculadora**: UF destino, Tipo de localidade, Tipo de veículo, KM da rota (com link "Consulte a quilometragem no Qualp", https://qualp.com.br/#/), Observações. Resultado: Valor do Frete (destaque) com UF/localidade/veículo, Tarifa por KM, KM da rota, Ad valorem, e o bloco de **condições comerciais** (texto padrão). Ações: Salvar cotação, Limpar, Copiar, Enviar e-mail.
  - **Tabelas de Preço** (submódulo de cadastro, pré-requisito da calculadora): busca por UF ou região, filtro de status, colunas UF, Região, Tipo, VAN, Utilitário, 1,5T, Ad valorem, Status, Versão, Ações; botões Importar CSV, Exportar CSV, Nova Tabela e "Excluir Tudo" (somente Admin, confirmação forte).
  - **Relatório**: histórico de cotações FTL com status.
- A calculadora usa a tabela **ativa** de UF + Tipo de localidade. Edição gera nova versão (histórico).
- CRUD, histórico de alterações, importar/exportar CSV, histórico de cotações FTL com status.
- **Cotação FTL não tem cliente** (confirmado em 08/11/2026). Rota = "Tabela FTL: UF Capital/Interior".
- Só uma tabela **ativa** por UF + Tipo de localidade. "Excluir Tudo" = arquivar (como nas tarifas aéreas).
- CSV no mesmo estilo do de tarifas aéreas: `UF;Região;Tipo;Utilitário R$/Km;VAN R$/Km;1.5T R$/Km;Ad Valorem %;Status;Versão;Observações`.

### 3.5 Status das cotações

Pendente (azul), Aprovada (verde), Declinada (laranja: cliente recusou por preço/prazo), Recusada (vermelho: inviável operacionalmente). Toda mudança de status é registrada (quem, quando, de → para).

- **Quem altera** (08/11/2026): qualquer usuário muda o status de uma cotação que **não está Aprovada**; tirar uma cotação de **Aprovada** é **só Admin**. Vale para Spot e FTL.

### 3.6 Relatório Spot

- Filtros combináveis: texto (nº da cotação, cliente, origem, destino), período, status e modal.
- Estatísticas: quantidade, valor total, distribuição por status (quantidade e valor).
- Por cotação: Visão Cliente (sem custos internos), Visão Operação (todos os componentes), Alterar status, Editar (bloqueado se Aprovada), Duplicar como nova, PDF, Excluir (somente Admin, **soft delete**).
- Exportação Excel das cotações filtradas, com cabeçalho formatado.

### 3.7 Dashboard

- KPIs: total de cotações, cotações hoje, aprovadas, **Valor cotado** (todas), **Valor aprovado** e **taxa de conversão** = Aprovadas ÷ (Aprovadas + Declinadas). Recusadas e Pendentes não entram.
- Spot e FTL juntos, com filtro por modal.
- Gráficos: volume mensal (aéreo × rodoviário), Top 10 rotas, distribuição por status (pizza + barras de valor). No volume mensal, **rótulo com o total do mês em cima de cada barra** (quantidade ou valor compacto, conforme a medida) — 22/11/2026.
- Filtro de período global, atalhos para os módulos, atividade recente.

### 3.8 Clientes

- CRUD com busca em tempo real.
- **Exclusão = desativação (soft delete)**: o histórico continua mostrando o nome do cliente. Clientes inativos não aparecem para novas cotações.
- Campos (Fase 2): Nome (obrigatório, único entre os ativos, sem diferenciar maiúsculas), CNPJ/CPF, Contato, E-mail, Telefone, Observações.
- Operacional cadastra e edita clientes; **desativar/reativar é só Admin**.

### 3.9 Usuários e acesso

- Login por usuário + senha. Perfis:
  - **Admin**: acesso total, gestão de usuários, configurações, exclusões.
  - **Operacional**: cotações, consulta de tarifas, relatórios. Não exclui nem acessa a área administrativa.
- Permissão adicional **"Pode editar tarifas"** (substitui as "senhas de área" do app antigo, que eram validadas no navegador e podiam ser burladas). Toda checagem de permissão acontece **no servidor**.
- Ativar/desativar usuário, redefinição de senha pelo Admin, troca da própria senha.
- **Sem "modo visitante".**
- Log de auditoria: login, criação/edição/exclusão de cotações, tarifas, clientes e usuários.
- Regras de acesso (Fase 2): sessão expira após **12 h sem uso**; senha com **mínimo 8 caracteres, letras e números**; **5 erros seguidos bloqueiam por 15 min**; usuários **nunca são excluídos**, só desativados; Admin não desativa a si mesmo e sempre resta ao menos 1 Admin ativo. Senha temporária (novo usuário/redefinição) é gerada pelo sistema e mostrada uma única vez.

### 3.10 Links úteis

Menu lateral com atalhos configuráveis pelo Admin (nome + URL). Iniciais: Qualp (https://qualp.com.br/#/), Google Maps (https://www.google.com/maps), WebRouter, JAT Transportes. ⚠️ URLs do WebRouter e do JAT Transportes ainda não informadas: o seed cria só Qualp e Google Maps; o Admin adiciona os outros em Configurações.

### 3.11 Instalação e custo (diretriz, 08/11/2026)

- Instalação no servidor **o mais prática possível** (meta: um script que faz tudo) e sempre a opção de **custo zero ou próximo de zero** (software livre/gratuito; sem licenças pagas, sem serviços em nuvem pagos).
- Só o servidor recebe instalação; os operadores usam o navegador.
- Decisões de 11/11/2026:
  - **Servidor Windows** (10/11 ou Server); acesso em **`http://<servidor>:3333`**.
  - O sistema roda **sozinho com a máquina** e se reinicia se cair (Agendador de Tarefas do Windows, sem programas extras).
  - **Backup diário às 23h**, guardando as **30 cópias** mais recentes (`pg_dump`).
  - **Migração do Base44 sem cotações antigas**: entram só os cadastros (clientes, tarifas aéreas, tabelas FTL). As cotações começam do zero, em `JQ-000001`.
- Decisão de 14/11/2026: **instalador gráfico** (`JAT-Quote-Setup-<versão>.exe`, Inno Setup, gratuito) que **instala tudo** (PostgreSQL, Node.js e Chromium embutidos, sem internet) e pergunta pasta, porta, login do Admin, pasta/horário/cópias do backup e liberação em rede pública. O script `instalar.ps1` continua como alternativa.
### 3.12 Plano de vigência (licença), rodapé e logo (decisões de 14/11/2026)

- O sistema só funciona com um **plano de vigência ativo**: **Mensal, Trimestral (3 meses), Semestral (6 meses), Anual ou Vitalício** (Vitalício: sem vencimento e sem aviso; não volta para plano com prazo — 17/11/2026). Sem plano (primeiro acesso), com plano vencido ou com licença alterada, **todos** veem só a tela de ativação; os dados continuam guardados e o backup segue rodando.
- Quem ativa/renova: um **Admin** (usuário + senha, ou já logado em Configurações → Plano de vigência) **e** a **senha mestre de ativação**, fornecida pelo responsável pelo sistema. A senha mestre **nunca é gravada** (nem no código, nem no git, nem no banco): o código guarda só a chave pública Ed25519 derivada dela (scrypt) e cada licença é **assinada**. Trocar a senha mestre = `npm run licenca:chave -w @jat/api`, atualizar `CHAVE_PUBLICA_LICENCA` e gerar novo setup.
- Prazo em **meses de calendário**, válido até o **fim do dia** do vencimento (Brasília). Renovar antes de vencer **soma ao que falta**; plano vencido conta a partir de hoje.
- **Aviso 15 dias antes, só para Admins** (faixa no topo com o botão Renovar).
- 5 senhas mestre erradas seguidas bloqueiam a ativação por 15 min. Ativações e falhas vão para a auditoria.
- Proteções: licença presa à instalação; alteração no banco invalida a assinatura; **relógio do servidor atrasado** (mais de 6 h antes do último uso) bloqueia até reativar.
- **Rodapé** em todas as telas: "JAT Quote © 2027 - Sistema de Cotações Logísticas | Desenvolvido por Igor Cruz".
- **Clicar na logo da JAT** abre https://www.grupojat.com.br/ em nova aba.
- Versão **1.0.0** (primeira com ativação).

### 3.13 Cotações de teste importadas (17/11/2026)

- No Relatório Spot, só Admin: **"Importar cotações (Excel)"** com a planilha exportada (colunas Nº, DATA, CLIENTE, ROTA, MODAL, TOTAL, STATUS), com prévia e erros por linha.
- A planilha só tem o total: entra **custo = total, sem markup e sem pedágio**; mantém número JQ, data (hora de Brasília) e status; clientes que não existem são criados; cidades achadas no IBGE sem diferenciar acentos (as que não existem ficam como vieram). Número JQ já existente = erro na linha.
- As importadas ficam marcadas como **dado de teste** (selo "teste") e saem todas de uma vez em **"Remover dados de teste"** (confirmação forte; apaga de vez só as marcadas; os clientes ficam). A numeração continua depois do maior número.
- Versão **1.1.0**.

- ⚠️ Pendente: nome do usuário Admin do servidor (o instalador pergunta) e os CSVs reais exportados do Base44.

## 4. Padrões de qualidade

- **Dinheiro**: nunca use float. Use `decimal.js` no `packages/core` e `Decimal(14,2)` no banco. Calcule sem arredondar e arredonde **só o resultado final**, com **arredondamento comercial (meio para cima, `ROUND_HALF_UP`)**, o mesmo do Excel. O valor gravado já é o arredondado, para PDF, Excel e tela baterem.
- **PDF**: HTML → PDF com o Chromium do Playwright no servidor (requer Chromium instalado no servidor, ~300 MB).
- **Testes de referência (golden tests)** que precisam passar sempre:
  - Rodoviário: custo R$ 1.000, markup 10%, pedágio R$ 100 → subtotal **R$ 1.100,00** e total **R$ 1.200,00**; ad valorem 0,15% fora do total.
  - Cubagem 1×1×1 m, 10 kg → aéreo **166,67 kg** e rodoviário **300,00 kg**.
  - Tarifa aérea: peso × tarifa abaixo do mínimo → cobra o mínimo.
  - Rodoviário (app atual): custo 350, markup 70%, pedágio 150 → MKUP **245,00**, subtotal **595,00**, total **745,00**.
  - Aéreo (app atual): coleta 300, aéreo 600, entrega 150, markup 70%, pedágio 150 → MKUP **735,00**, subtotal **1.785,00**, total **1.935,00**.
  - Cubagem vários volumes (app atual): rodoviário taxado **203,00 kg**; aéreo 3 volumes taxado **207,00 kg**, cubado **102,88 kg** (ver §3.2).
  - FTL (app atual): VAN R$ 3,60/km × 300 km → **R$ 1.080,00**.
  - Todos estão em `packages/core/src/golden.test.ts`.
- Toda entrada de API é validada com Zod. Os erros aparecem ao usuário em português, de forma clara.
- Sem segredos no código: use `.env`, com um `.env.example` documentado.
- Commits pequenos e descritivos, em português, ao fim de cada etapa concluída.

## 5. Padrão visual

Objetivo: interface **profissional e impressionante**, no nível de produtos SaaS modernos (Linear, Vercel, Stripe). Nada de visual de formulário genérico.

- Tema claro e escuro, com alternância.
- Identidade JAT: logo oficial em `apps/web/public/brand/logo-jat.png` (recebida em 07/11/2026; fica branca no tema escuro). Cor principal = azul da logo **#1F428A**. Cores sempre via tokens (CSS variables). Uma versão vetorial (SVG) da logo melhoraria a nitidez no PDF.
- **Duas marcas** (16/11/2026): o **Quote** é a marca do produto e a **JAT** é a empresa atendida. As logos aparecem lado a lado (JAT | Quote) no menu, no login (maiores, canto superior esquerdo) e na tela de ativação. Logo do Quote: original em `apps/web/public/brand/logo-quote-original.png` ("Q" branco, para fundo escuro); `scripts/gerar-logos-quote.ps1` gera a versão de fundo claro ("Q" no azul JAT), as compactas e o favicon.
- **Paleta**: azul JAT (`--brand`) nas ações, seleção e foco; laranja do Quote (`--quote` #FD8B21 → `--quote-2` #FEAE2E) só em detalhes: filete azul→laranja no topo, indicador do menu, destaques. Texto em laranja só com `--quote-texto` (contraste).
- Tipografia Inter ou Geist; números tabulares nos valores monetários.
- Layout: sidebar recolhível, cabeçalho com usuário e perfil, paleta de comandos (Ctrl+K), atalhos de teclado nas ações frequentes.
- Feedback: skeletons no carregamento, toasts nas ações, estados vazios bem desenhados, confirmação em ações destrutivas.
- Resultado da calculadora atualizado em tempo real, com destaque visual no total.
- Após cada tela pronta, tire screenshots com Playwright (claro e escuro, 1366×768 e 1920×1080), revise e corrija espaçamento, alinhamento e contraste antes de me mostrar.

## 6. Forma de trabalho

- Trabalhe **por fases** (ver `ROADMAP.md`). Ao fim de cada fase: rode todos os testes, faça o commit, resuma o que foi feito e **pare para eu validar** antes de seguir.
- Antes de cada fase, apresente um plano curto e aguarde meu OK.
- Diante de uma regra ambígua, **pergunte**. Nunca invente regra de negócio.
- Mantenha `README.md` com instruções de instalação, execução e backup.
