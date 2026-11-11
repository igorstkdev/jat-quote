# JAT Quote — Checklist de testes manuais (v1.0 beta)

Roteiro para os operadores e o Admin conferirem o sistema no servidor antes de aposentar o
Spot Calculator (Base44). Marque cada item com `[x]` ao conferir. Se algo não bater, anote a tela,
o que foi feito e o resultado e avise o responsável pelo sistema.

| Data do teste | Quem testou | Endereço usado           |
| ------------- | ----------- | ------------------------ |
|               |             | `http://<servidor>:3333` |

Os valores esperados abaixo são casos reais conferidos no app atual.

## 1. Acesso (Admin)

- [ ] O endereço abre a tela de login a partir de **outra máquina da rede**.
- [ ] O Admin entra com a senha temporária e o sistema **exige a troca** da senha.
- [ ] Senha nova sem número (ex.: `abcdefgh`) é recusada; com letras e números e 8+ caracteres é
      aceita.
- [ ] Administração → Usuários: criar um usuário **Operacional**. A senha temporária aparece uma
      única vez.
- [ ] Criar um Operacional com a opção **"Pode editar tarifas"**.
- [ ] Errar a senha de um usuário **5 vezes seguidas** bloqueia o login por 15 minutos.
- [ ] O Admin redefine a senha do usuário bloqueado e ele volta a entrar.
- [ ] O tema claro/escuro alterna no ícone do cabeçalho; **Ctrl+K** abre a busca de telas.

## 2. Cadastros iniciais (Admin)

- [ ] Clientes → **Importar CSV** com a exportação do Base44: a prévia mostra novos, atualizados e
      erros por linha. Baixar o relatório e conferir os números de linha no Excel.
- [ ] Corrigir os erros e importar. Os clientes aparecem na lista.
- [ ] Tarifas Aéreas → **Importar CSV** com a exportação do Base44 e conferir as quantidades por
      companhia (GOL, AZUL, LATAM) com o app antigo.
- [ ] FTL Fiat → Tabelas de Preço → **Importar CSV** (ou cadastrar) as tabelas por UF.
- [ ] Administração → Configurações: conferir ad valorem padrão (Aéreo 0,47%, Rodoviário 0,15%),
      condições comerciais do FTL, links úteis e links de rastreio.

## 3. Frete Spot (Operacional)

- [ ] **Rodoviário**: cliente qualquer, custo **R$ 350,00**, pedágio **R$ 150,00**, markup
      **70%** → MKUP total **R$ 245,00**, subtotal **R$ 595,00**, total **R$ 745,00**.
- [ ] **Aéreo**: coleta **300**, aéreo **600**, entrega **150**, pedágio **150**, markup **70%** →
      MKUP **R$ 735,00**, subtotal **R$ 1.785,00**, total **R$ 1.935,00**.
- [ ] Markup negativo mostra "O markup não pode ser negativo."
- [ ] O ad valorem aparece como informativo e **não muda o total**.
- [ ] Salvar: a cotação recebe o número **JQ-000001** (as próximas seguem a sequência) e fica
      **Pendente**.
- [ ] **Copiar** e colar no WhatsApp: número, cliente, rota, valor, ad valorem e validade de 30 dias.
- [ ] **E-mail** abre o programa de e-mail com assunto e corpo preenchidos.
- [ ] **PDF do cliente** não mostra custos internos; **PDF da operação** mostra custo base e MKUP por
      componente.
- [ ] Recarregar a página (F5) no meio do preenchimento não perde o que foi digitado.

## 4. Cubagem

- [ ] Rodoviário, 1 volume 0,4 × 0,3 × 0,3 m, 3 kg → cubado **10,80 kg**, taxado **10,80 kg**.
- [ ] Rodoviário, 1 volume 0,5 × 0,8 × 1,2 m, 200 kg → cubado **144,00 kg**, taxado **200,00 kg**.
- [ ] Rodoviário, 0,5 × 0,8 × 1,2 m 200 kg + 0,2 × 0,4 × 0,45 m 3 kg → bruto **203,00**, cubado
      **154,80**, taxado **203,00 kg**.
- [ ] Aéreo, os dois volumes acima + 0,5 × 0,45 × 0,45 m 4 kg → cubado **102,88 kg**, taxado
      **207,00 kg**.
- [ ] Quantidade por volume, duplicar e remover volume funcionam.

## 5. Tarifas aéreas

- [ ] Calculadora rápida: origem, destino, nível e peso listam as companhias **do menor para o
      maior custo**; peso × tarifa abaixo do mínimo cobra o **mínimo**.
- [ ] "Usar peso da Cubagem" traz o peso taxado aéreo; "Usar no Frete Spot" leva o valor para o
      Custo Aéreo.
- [ ] Cadastrar uma tarifa com vigência sobreposta à de outra da mesma rota e companhia é
      **recusado**.
- [ ] Editar uma tarifa cria uma nova versão e o **histórico** mostra o que mudou.
- [ ] Operacional **sem** "Pode editar tarifas" consulta, mas não vê "Nova tarifa".

## 6. FTL Fiat

- [ ] SP Capital, **VAN R$ 3,60/km**, **300 km** → **R$ 1.080,00** (ad valorem da tabela,
      informativo).
- [ ] KM abaixo de 25 mostra "KM da rota: mínimo 25 km." e não deixa salvar.
- [ ] As condições comerciais aparecem no resultado, no Copiar, no e-mail e no PDF.
- [ ] A cotação salva aparece em FTL Fiat → Relatório.

## 7. Status, relatório e dashboard

- [ ] Mudar uma cotação para **Aprovada**: ela não pode mais ser editada.
- [ ] Operacional **não** consegue tirar uma cotação de Aprovada; o Admin consegue (fica na
      auditoria).
- [ ] "Duplicar como nova" cria outra cotação Pendente com os mesmos dados.
- [ ] Relatório Spot: filtros por texto, período, status e modal; os totais por status batem com
      a lista.
- [ ] **Exportar Excel** abre no Excel com valores em R$ somáveis e a linha de totais.
- [ ] Excluir cotação aparece **só para o Admin**; a cotação some das telas e a exclusão aparece em
      Administração → Auditoria.
- [ ] Dashboard: conversão = Aprovadas ÷ (Aprovadas + Declinadas); o filtro FTL mostra só FTL.

## 8. Servidor (responsável pelo sistema)

- [ ] `scripts\servico.ps1 -Acao status` mostra "no ar" e o endereço.
- [ ] Reiniciar o servidor: o JAT Quote volta sozinho, sem ninguém logar no Windows.
- [ ] No dia seguinte, existe um backup novo em `backups\` (ou em `BACKUP_DIR`) e
      `logs\backup.log` registra "Backup criado".
- [ ] **Teste de restauração** (fora do horário de uso): criar uma cotação de teste, restaurar o
      backup da noite anterior com `scripts\restaurar.ps1` e conferir que a cotação de teste sumiu.
      Depois, restaurar o backup "antes-restauracao" para voltar ao estado atual.
- [ ] A pasta de backups é copiada para outro disco ou para a rede.
