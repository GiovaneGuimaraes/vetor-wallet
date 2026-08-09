# CLAUDE.md — @vetor-wallet/expenses-core

Regras de despesas do Vetor Wallet — hoje, a **recorrência mensal** (T-035).
Extraído de `packages/rest-api/src/api/services/recurringExpenses.ts` na T-099b
(Ciclo 19 — arquitetura em módulos). Categoria **Core**, módulo **Expenses**
(ver `docs/MODULES.md`/`docs/PACKAGES.md`). É dono das tabelas
`recurring_expenses`, `recurring_expense_months` e `expense_entries`, e por isso
importa `@vetor-wallet/db` — "Core" é *dono das regras/dados do domínio*, não
*nunca faz I/O*.

`normalizeCategory` **não** está aqui: saiu para `@vetor-wallet/validation-core`
na T-099a por ser transversal (o `db` também usa, em `migrations.ts`).

Este arquivo substitui `docs/decisions/expenses-budgets.md` (hoje um stub
apontando para cá) e cobre o módulo Expenses inteiro, incluindo o que vive nas
rotas do `server` e nas telas do `web`.

A importação bancária (dedupe por `external_id`, T-084, e OFX, T-085/T-086)
**saiu daqui na T-099c** para `packages/bank-import-core/CLAUDE.md`, junto de
`services/externalId.ts` e `services/ofx.ts` — ela escreve em `expense_entries`,
mas a política de importação é do módulo BankImport.

## Estrutura

```
src/
├── recurringExpenses.ts  # daysInMonth/occurrenceDate (puras),
│                         # createRecurringExpenseEntry (transação interativa),
│                         # materializeRecurringExpenses (lazy + idempotente);
│                         # re-exporta isUniqueViolation de @vetor-wallet/db
└── index.ts              # barrel
```

Rotas: `packages/rest-api/src/api/routes/{expenses,expenseEntries,recurringExpenses,budgets}.ts`.
Lógica pura do cliente: `packages/web/src/routes/{expenseMonth,recurrence,expensesGrouping,monthFetch,ofxImportReport}.ts`.

## Invariantes (não quebrar)

- **A materialização de recorrência é lazy e idempotente** (T-035): rodar duas
  vezes no mesmo mês não pode duplicar lançamento. A idempotência é do **banco**
  (`UNIQUE(recurring_id, month)` em `recurring_expense_months`), não do código.
- **Excluir uma ocorrência não a recria** — o controle vive em tabela própria,
  não num índice único sobre `expense_entries`.
- **`occurrenceDate` nunca transborda para o mês seguinte** (`min(day_of_month,
  dias do mês)`), senão a ocorrência não pertenceria ao mês consultado.
- **`isUniqueViolation` distingue a corrida de qualquer outro erro de banco** —
  os demais continuam subindo como 500, nunca viram "outro já gerou" silencioso.
- **Não importa `express`** nem nada de `server`/`web` (regra 1 de
  `docs/PACKAGES.md`).

## Despesas fixas × lançamentos variáveis

O layer `/despesas` soma **duas** fontes diferentes: `fixed_expenses` (itens fixos mensais, **sem data** — valem integralmente para qualquer mês exibido) e `expense_entries` (gastos datados, filtrados por mês). O **total do mês exibido é fixas + variáveis daquele mês** — calculado por `computeMonthTotals` em `packages/web/src/routes/expenseMonth.ts` (função pura, testada), não inline no componente. A navegação de mês é estado local da `DespesasPage`: trocar o mês recarrega só os lançamentos (`GET /api/expense-entries?month=`), pois as fixas não dependem do mês. Consequência esperada: navegar para um mês passado/futuro não altera a parcela de fixas do total — não há histórico de quando uma despesa fixa passou a existir. O filtro mensal no server usa `substr(date, 1, 7) = ?` (compatível com o índice `idx_expense_entries_user_date` apenas parcialmente — se a tabela crescer muito, trocar por range `date >= ? AND date < ?`). O mês default é calculado no fuso local do processo (`currentMonth`), não em UTC, para não virar o mês antes da hora no BRT.

## Recorrência de lançamentos de despesa: materialização lazy e idempotente (T-035)

Uma despesa variável que se repete todo mês (assinatura, mensalidade) é cadastrada uma vez e as ocorrências dos meses seguintes aparecem sozinhas. As decisões de projeto:

- **Modelo: template + livro-razão, ocorrências são lançamentos normais.** `recurring_expenses` guarda só o template (descrição, categoria normalizada, valor, `day_of_month`, `start_month`, `active`). Cada ocorrência é uma linha comum de `expense_entries` com `recurring_id` preenchido — logo entra nos totais, no orçamento por categoria e no histórico sem nenhum caso especial, e pode ser editada/excluída individualmente pela T-031. **Não** existe "valor efetivo herdado do template": editar a ocorrência de agosto para 175,50 não muda a de setembro (que continua saindo com o valor do template).
- **Criação sempre acoplada ao lançamento.** Não há `POST /api/recurring-expenses`; a recorrência nasce em `POST /api/expense-entries` com `recurring: true`. Assim a **primeira ocorrência é o próprio lançamento criado**, já registrada no livro-razão — sem isso o primeiro GET do mês do lançamento geraria uma segunda cópia idêntica. `dayOfMonth` opcional sobrepõe o dia derivado de `date`.
- **As três escritas da criação rodam numa transação interativa (T-045).** `createRecurringExpenseEntry` (`recurringExpenses.ts` deste package) grava o template (`recurring_expenses`), a reserva do mês (`recurring_expense_months`) e a primeira ocorrência (`expense_entries`) dentro de um único `db.transaction('write')` — não `db.batch`, porque a 2ª e a 3ª escrita dependem do `lastInsertRowid` da 1ª (`recurring_id` a vincular), e um `batch` não expõe o resultado de uma instrução para as seguintes na mesma chamada. `finally { tx.close() }` cobre commit e rollback: se `commit()` já rodou, `close()` não faz nada; se alguma escrita lançar antes do commit, `close()` reverte a transação inteira. Antes da T-045 as três escritas eram independentes e uma falha no meio podia deixar o template órfão ou o mês reservado sem lançamento — o mesmo problema que a materialização lazy (bullet seguinte) já evitava com `db.batch`.
- **O piso (`start_month`) é o mês de CRIAÇÃO, não o mês do lançamento** — `max(mês de date, mês corrente)`. Marcar como recorrente um lançamento com data passada é caminho normal da UI (navegar para um mês passado deixa o campo de data em `${mês}-01`), e usar o mês do lançamento como piso faria o próprio handler — via o `refreshHistory()` → `/summary` que ele dispara — gerar ocorrências reais em **meses já fechados**, reescrevendo total, orçamento e histórico daqueles meses sem o usuário ver. Data **futura** continua valendo como piso: a recorrência só começa quando o lançamento acontece. O livro-razão marca o mês do **lançamento** (e não `start_month`): num cadastro retroativo os dois divergem, e marcar o mês corrente suprimiria a ocorrência que a recorrência deve gerar agora. O web espelha a regra em `recurrenceStartMonth`/`startsLaterThanEntry` (`packages/web/src/routes/recurrence.ts`) só para avisar, no form, que a repetição vai começar no mês corrente.
- **A idempotência é do banco, não do código.** `recurring_expense_months` tem `UNIQUE(recurring_id, month)`. A reserva do mês e o `INSERT` da ocorrência vão no **mesmo `db.batch(..., 'write')`** (transacional): se fossem escritas independentes, uma falha entre elas deixaria o mês marcado como gerado para sempre, sem ocorrência e sem caminho de reparo — indistinguível de uma ocorrência excluída de propósito. A reserva é um `INSERT` **sem** `OR IGNORE`: é a violação da chave única que sinaliza "outra request chegou primeiro", derruba o batch inteiro e faz o perdedor da corrida não inserir nada (`isUniqueViolation` distingue esse caso de qualquer outro erro de banco, que continua subindo como 500). Antes do laço, uma única query carrega os pares (recorrência, mês) já gerados — a violação é a rede de segurança contra concorrência, não o caminho normal. O perdedor pode responder aquele mês sem a ocorrência que o vencedor acabou de gravar; o GET seguinte já a mostra.
- **Excluir uma ocorrência não a recria** — e é por isso que o controle é uma tabela própria, não um índice único sobre `expense_entries`: a chave de controle sobrevive ao `DELETE` do lançamento. Com um índice único sobre as ocorrências, apagar a ocorrência liberaria a chave e o próximo GET a materializaria de novo, tornando a exclusão impossível na prática. Consequência aceita: não há como "recuperar" uma ocorrência excluída sem criar um lançamento à mão.
- **Onde a materialização roda**: `GET /api/expense-entries?month=` (o mês pedido) e `GET /api/expense-entries/summary` (todos os meses da janela agregada), sempre **antes** da leitura, para que as ocorrências geradas apareçam na mesma resposta. O `month` inválido é rejeitado com `400` antes de qualquer escrita. Efeito colateral desejado: a Home também chama `GET /api/expense-entries?month=` (T-025), então abrir a Home já materializa o mês corrente e a "sobra do mês" real considera as recorrências.
- **Meses futuros são materializados** (decisão): navegar ‹/› para frente em `/despesas` mostra a assinatura que já se sabe que vai cair lá — é o que o usuário espera ao planejar. `/summary` só gera mês futuro quando o cliente informa `?endMonth=` futuro (T-049), e sempre limitado pelo mesmo teto de horizonte. Há um **teto de horizonte** (`MATERIALIZATION_HORIZON_MONTHS = 12`, em `packages/rest-api/src/api/routes/expenseEntries.ts`): o `month` da query só é limitado pelo formato, então um `?month=9999-12` escreveria ocorrências indefinidamente à frente. Meses além do horizonte continuam sendo listados, apenas não geram nada.
- **Meses anteriores a `start_month` nunca são gerados**: navegar para trás não inventa histórico, e cadastrar retroativamente não preenche os meses intermediários (coberto por teste).
- **Dia ajustado para meses curtos**: `occurrenceDate` (neste package, função pura testada) faz `min(day_of_month, dias do mês)` — dia 31 cai em 28/02 (29/02 em ano bissexto) e em 30/04. A ocorrência nunca transborda para o mês seguinte, senão não pertenceria ao mês consultado.
- **Encerrar é soft e para tudo o que ainda não foi gerado** — inclusive meses passados nunca visitados, não só os futuros. As ocorrências já materializadas ficam (são lançamentos comuns). `DELETE /api/recurring-expenses/:id` é alias de `PATCH { active: false }` e nunca apaga a linha: as ocorrências a referenciam por FK e o livro-razão precisa continuar existindo. Encerrar duas vezes é idempotente.
- **Reativar responde `400`** (crie outra recorrência): reativar reabriria a janela de meses entre o encerramento e hoje, que seriam materializados de uma vez no GET seguinte.
- **Editar o template está fora de escopo** — o `PATCH` só aceita `active`. Mudar valor/dia afetaria as ocorrências futuras e não as passadas, e a semântica dessa assimetria precisa de decisão de produto antes.
- No web, o checkbox "Repetir todo mês" vive no form de novo lançamento; as ocorrências ganham o selo `↻ recorrente` na lista (via `isRecurringOccurrence`), e o card "Recorrências mensais" lista as ativas com botão Encerrar. Helpers puros e testados em `packages/web/src/routes/recurrence.ts`.
- **Fora de escopo (segue pendente)**: recorrência em renda/poupança, frequências além de mensal, edição em massa de ocorrências passadas e retroagir a recorrência para antes da criação.

## Histórico mensal sem gráfico (T-033, `endMonth` explícito na T-049)

A seção "Últimos meses" em `/despesas` mostra os últimos `HISTORY_MONTHS` (6) meses — total = fixas vigentes **hoje** + variáveis daquele mês — sem nenhum gráfico (decisão do humano, `TODO-HUMANO.md`). `GET /api/expense-entries/summary?months=N` agrega só os lançamentos variáveis por mês (`GROUP BY substr(date,1,7)`); **meses sem lançamento ficam ausentes** da resposta — decisão de projeto para manter a query simples (não precisa gerar uma série completa no SQL). Quem preenche os N meses pedidos com variável = 0 é a função pura `buildMonthlyHistory` (`packages/web/src/routes/expenseMonth.ts`, testada), que também junta o total de fixas (constante nas N linhas, pois não há histórico de fixas) e monta os rótulos via `shiftMonth`/`formatMonthLabel` já existentes de T-022 — sem duplicar essa lógica. O histórico é buscado uma vez no mount e **revalidado após criar/editar/remover um lançamento** (`refreshHistory()` nos três handlers de `expense_entries`) — sem isso, lançar/editar/apagar no mês corrente atualiza o "Total do mês" mas deixaria a linha "atual" do histórico com um valor contraditório até um reload. Não recarrega ao navegar de mês (‹/›), pois é relativo ao mês corrente real, não ao mês exibido. Cada linha é clicável: chama `applyMonth(row.month)`, a mesma função que a navegação ‹/› usa internamente (`goToMonth` virou um wrapper dela), reaproveitando o mesmo `monthKey`/side effects (recalcula a data default do form e cancela edição aberta). A revalidação (`refreshHistory`) não zera a tela para "Carregando…" — só volta a esse estado quando ainda não há nenhum dado carregado; durante um refetch, o histórico anterior continua visível (T-049).

O ponto de atenção antes documentado aqui (janela ancorada no mês do **server** enquanto as linhas eram montadas com o mês do **browser**, causando a linha "atual" zerada por instantes na virada de mês em fusos divergentes) foi **corrigido na T-049**: `GET /api/expense-entries/summary` aceita `?endMonth=YYYY-MM` opcional (mesma validação de formato de `month`; `400` para inválido; default o `currentMonth()` do server, para não quebrar consumidores que não enviam o parâmetro) e o web (`getExpenseEntriesSummary`, chamado por `refreshHistory` em `DespesasPage`) sempre envia `currentMonthKey()` — a janela dos N meses passa a ser ancorada no MESMO fuso usado para montar as linhas. Como `endMonth` agora pode ser futuro (informado pelo cliente), o `/summary` deixou de valer a premissa "nunca gera mês futuro porque a janela termina no mês corrente": a materialização de recorrências aplica o mesmo teto `MATERIALIZATION_HORIZON_MONTHS` já usado em `GET /?month=` — meses da janela além do horizonte continuam sendo **agregados** (o SELECT não tem teto), apenas não disparam `materializeRecurringExpenses` para eles.

## Orçamento por categoria × mês exibido

Decisão do humano (T-037, 2026-07-25): a seção "Orçamento do mês" (barras de progresso, form de criação/upsert e botão de remover) foi removida do render de `DespesasPage.tsx` — "não entendi a utilidade do orçamento do mês". O backend seguiu intacto: `packages/rest-api/src/api/routes/budgets.ts`, `packages/web/src/routes/budgetProgress.ts` e todos os testes de ambos continuaram ativos.

**Reintroduzida na T-082 (Ciclo 16)**: o backlog trouxe de volta a decisão — item do ciclo constatou que, mesmo com a feature ausente do render, um teto de orçamento cadastrado não aparecia em lugar nenhum até a categoria ter gasto no mês. A seção volta a `DespesasPage.tsx` na posição "orçamentos" da ordem de consulta da T-074 (total do mês → últimos meses → **orçamentos** → recorrências → listas), sempre visível (não atrás de `CollapsibleSection`, ao contrário do form de criação — ver abaixo). `computeBudgetProgress` já mapeia sobre a lista de `budgets`, não sobre `entries`/`fixedExpenses`: uma categoria com teto e **zero** gasto no mês já caía em `spent = 0`/`pct = 0` mesmo antes da T-082 (coberto por teste desde a criação da função) — o problema real era a seção inteira estar fora do render, não um bug no cálculo. A T-082 apenas reintroduz o render e adiciona testes explícitos cobrindo o caso "orçamento sem nenhum gasto no mês aparece a 0%" e "lista mista: orçamentos com e sem gasto lado a lado" em `budgetProgress.test.ts`.

O form de criação/upsert de orçamento (que existia antes da T-037) foi restaurado adaptado ao padrão de seção recolhível introduzido na T-074 (`CollapsibleSection`, "+ Novo orçamento") — a lista de progresso em si fica sempre visível (é consulta), só a criação/edição de um novo teto fica atrás do botão, seguindo a mesma lógica de "consulta é a ação majoritária" já aplicada ao form unificado de despesas.

**Removida de novo na T-089 (2026-08-05), decisão do humano**: "o card de orçamento complica o app" — a UI inteira do card "Orçamento do mês" foi removida de `DespesasPage.tsx` (estados, `refreshBudgets`, handlers `handleBudgetSubmit`/`handleBudgetDelete`, imports). Diferente da T-037 (só o render saiu), esta rodada removeu também o código que só existia para alimentar o card: `packages/web/src/routes/budgetProgress.ts`/`budgetProgress.test.ts` foram excluídos (eram o único consumidor de `GET/POST/DELETE /api/budgets` no web) e `getBudgets`/`upsertBudget`/`deleteBudget` saíram de `packages/web/src/api.ts`. O CSS `.vw-budget-*` saiu de `layers.css`. **O backend não foi tocado**: `packages/rest-api/src/api/routes/budgets.ts`, a tabela `category_budgets` e o tipo `CategoryBudget` em `shared/` permanecem intactos, agora sem nenhum consumidor no frontend — reintroduzir a UI no futuro não precisaria de nenhuma mudança de schema ou de API.

`GET /api/budgets` não tem parâmetro de mês — o teto de `category_budgets` vale indefinidamente até ser substituído (upsert) ou removido. Quem varia por mês é o **gasto** comparado ao teto: `computeBudgetProgress` (função pura testada, enquanto existiu) somava despesas fixas da mesma categoria (`fixed_expenses`, sem data) + lançamentos variáveis da categoria já filtrados pelo mês exibido (`expense_entries` via `GET /api/expense-entries?month=`). Trocar de mês em `DespesasPage` recalculava a barra de progresso porque `entries` é recarregado, mas os orçamentos e as fixas permanecem os mesmos. O percentual exibido no texto não era limitado a 100% (podia mostrar 140%), mas a largura visual da barra era (`pctClamped`), com a cor trocando para `--color-warn` quando `pct >= 100`.

## Categoria é normalizada nas 3 telas de despesas/orçamento (T-028)

> A função vive em `@vetor-wallet/validation-core` desde a T-099a — ver
> `packages/validation-core/CLAUDE.md`. O texto abaixo fica aqui porque as
> decisões de produto são do módulo Expenses.

As três fontes que usam categoria como **texto livre** — despesas fixas (`fixed_expenses.category`), lançamentos variáveis (`expense_entries.category`) e orçamentos (`category_budgets.category`) — compartilham uma única forma canônica: `normalizeCategory` = NFC + `trim` + colapso de espaços internos + `toLocaleLowerCase('pt-BR')`. "Mercado", "mercado", "mercado " e "MERCADO" são a **mesma** categoria; um orçamento de "Mercado" soma os gastos lançados em "mercado".

Decisões de projeto:

- **A forma normalizada é a forma ARMAZENADA**, não uma chave paralela ao valor exibido. Consequência: toda comparação volta a ser `===` de string (em SQL e em JS) sem que nenhum dos pontos precise lembrar de normalizar, e o `UNIQUE(user_id, category)` de `category_budgets` garante unicidade lógica sozinho — o upsert de "Mercado" substitui o registro de "mercado" em vez de duplicar. Não foi preciso coluna de chave nem índice por expressão (`lower()`/`COLLATE NOCASE` do SQLite são ASCII-only e não dobrariam "SAÚDE"/"saúde"; `toLocaleLowerCase` dobra). Custo aceito: a caixa digitada não é preservada, então o web recapitaliza só a primeira letra na exibição via `formatCategoryLabel` ("IPTU" aparece como "Iptu").
- **A função é duplicada de propósito** entre backend (`@vetor-wallet/validation-core`) e `packages/web/src/routes/categories.ts`, cada uma com teste próprio. `shared/` é types-only por construção (`emitDeclarationOnly: true`, sem `main`; server e web só fazem `import type` dele) — exportar função de runtime de lá quebraria `server/dist` e o bundle do web. As duas cópias devem mudar juntas.
- **Gravação normalizada** nas rotas `POST /api/expenses`, `POST /api/expense-entries` e `POST /api/budgets`. Em budgets, a validação de "category obrigatória" (400) usa o valor já normalizado, então `"   "` continua sendo rejeitado.
- **Migração idempotente no `initDb()`** (`normalizeExistingCategories` em `packages/db/src/migrations.ts`), rodando a cada boot: reescreve as categorias das três tabelas na forma canônica. Idempotente por construção — na segunda execução nada mais difere, nenhum UPDATE/DELETE é emitido (não há flag de "migração já rodou"). A normalização pode **colidir** no `UNIQUE(user_id, category)` de `category_budgets` ("Mercado" + "mercado" do mesmo usuário → "mercado"): a regra é **vence o registro de maior `id`** (o mais recente; desempate por `id` e não por `created_at`, que tem resolução de segundos) e os demais da mesma categoria canônica são **apagados**. Os perdedores são deletados antes de o vencedor ser atualizado — na ordem inversa o UPDATE colidiria com o UNIQUE ainda ocupado.
- **O web também normaliza** em `groupByCategory` (`expensesGrouping.ts`) — defesa contra dados legados exibidos antes de a migração ter rodado naquele banco e contra o estado otimista da `DespesasPage`. Devolve em `category` o rótulo já pronto para exibição (`formatCategoryLabel`), com fallback "Sem categoria" no agrupamento.
- **Fora de escopo (segue pendente)**: autocomplete/select de categorias já usadas e renomear categoria em massa pela UI. Duas fixas gravadas antes da migração continuam sendo dois registros distintos com o mesmo nome canônico — a normalização une o *agrupamento*, não os registros.

## Edição inline nos layers básicos (T-031)

As quatro entidades dos layers básicos — renda (`/api/income`), despesas fixas (`/api/expenses`), lançamentos variáveis (`/api/expense-entries`) e lançamentos de poupança (`/api/savings`) — aceitam **PATCH parcial**, no mesmo formato de `PATCH /api/goals/:id`: todos os campos opcionais, corpo sem nenhum campo conhecido responde `400`, cada campo informado passa pela **mesma validação da criação** (`Number.isFinite` + `> 0` para dinheiro — T-029; `category` gravada normalizada por `normalizeCategory` — T-028) e o registro é localizado por `id AND user_id`, então o PATCH de um registro de outro usuário responde `404` (não vaza existência).

Semântica do PATCH em `savings` com meta vinculada — o ponto delicado da tarefa (ver também `packages/savings-core/CLAUDE.md`):

- O progresso da meta é **derivado na leitura** (T-024, não materializado), então editar `amount`/`type`/vínculo reflete na meta sem nenhum recálculo: um aporte vinculado de 100 editado para 175,50 muda o `current_amount` da meta na próxima leitura. Isso está coberto por teste explícito em `savings.test.ts`, junto do caso de um DEPOSIT vinculado virando WITHDRAW (que inverte o sinal no progresso).
- As invariantes do vínculo são avaliadas sobre o **estado resultante** do PATCH, não só sobre o corpo: `effectiveType = type ?? atual` e `effectiveGoalId = 'goalId' informado ? goalId : atual`. Consequências: `{ type: 'YIELD' }` num lançamento vinculado responde `400` (a regra "YIELD não pode ser vinculado" da criação continua valendo depois da edição); `{ goalId: <id> }` num lançamento que já é YIELD também responde `400`; e `{ type: 'YIELD', goalId: null }` no mesmo request é **aceito** — desvincular explicitamente é o jeito de converter um aporte vinculado em rendimento.
- `goalId` tem três estados distintos, e por isso o campo é `number | null | undefined`: **ausente** preserva o vínculo atual, **`null`** desvincula, **um id** revincula (com checagem de posse → `404` se a meta for de outro usuário). A posse só é consultada quando o vínculo muda de fato — revalidar o id já gravado seria uma query extra sem ganho.
- A UI de `/poupanca` evita o `400` do primeiro caso em vez de esperá-lo: trocar o tipo para Rendimento limpa o select de meta e exibe um aviso de que salvar vai desvincular o lançamento (o PATCH sai com `goalId: null`). O `400` do server continua sendo a garantia de integridade para qualquer outro cliente.

No web, as 4 telas ganharam **modo de edição no item da lista** (lápis → campos preenchidos → salvar/cancelar), reusando os mesmos `.vw-layerpage-field`/`.vw-layerpage-error` dos forms de criação. Dois helpers puros em `packages/web/src/routes/inlineEdit.ts` (testados) evitam repetir a mesma lógica quatro vezes: `parseMoneyInput` (aceita vírgula decimal, rejeita o que o server rejeitaria) e `diffEditableFields`, que reduz o rascunho aos campos alterados — **um rascunho salvo sem nenhuma alteração fecha o modo de edição sem chamar a API**, já que um PATCH vazio responderia 400. Detalhes de estado: em `/despesas`, editar a categoria de uma fixa reagrupa a lista pelo `groupByCategory` sem refetch (a resposta já vem normalizada) e editar a data de um lançamento para fora do mês exibido **remove o item da lista** (o server não o devolveria naquele mês); navegar de mês cancela um rascunho aberto. Em `/poupanca`, salvar refaz o fetch em vez de remendar o estado, porque `summary` e progresso de meta são derivados no server. Enquanto um item está em edição, os botões de editar/remover dos outros itens ficam desabilitados (um rascunho aberto por vez).

Fora de escopo (segue pendente): editar operações de ações, histórico/auditoria de edições e edição em massa.

## Dedupe de fetch mensal em Despesas/Renda (T-049)

`DespesasPage`/`RendaPage` já tinham a guarda de "resposta obsoleta" da T-030 (`latestRequestedMonthRef`), que decide qual resposta **vale** quando duas chegam fora de ordem — mas não impedia que um fetch fosse **disparado** de novo para o mesmo mês já em andamento (ex.: o efeito de busca reexecutando duas vezes em StrictMode, ou dois disparos muito próximos apontando para o mesmo mês). `packages/web/src/routes/monthFetch.ts` (`MonthFetchGuard`, testada em `monthFetch.test.ts`) resolve isso: `refreshEntries` consulta `isInFlight(month)` antes de buscar e sai cedo se já há uma chamada em voo para aquele mês; `start`/`finish` marcam o começo/fim. O guard rastreia só **o mês mais recente em voo** (um `string | null`, não um conjunto) — suficiente porque `refreshEntries` só se importa com o mês exibido no momento. As duas guardas são complementares e continuam sendo necessárias — uma decide "disparar ou não", a outra decide "aplicar ou não a resposta".

## Importação bancária: dedupe por `external_id` (T-084) e OFX (T-085/T-086)

Migrado para `packages/bank-import-core/CLAUDE.md` na T-099c — junto de
`services/ofx.ts` e `services/externalId.ts`. As duas mecânicas escrevem em
`expense_entries`, mas a política de importação é do módulo **BankImport**.
Interação relevante daqui: `externalId` + `recurring: true` é `400` — os dois
mecanismos de idempotência (o desta recorrência e o do dedupe) não se misturam.

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Expenses) e `packages/validation-core/CLAUDE.md`
(`normalizeCategory`).
