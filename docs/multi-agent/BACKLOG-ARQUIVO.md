# Arquivo historico do backlog - ciclos concluidos

> Registro permanente das tarefas concluidas, movido do BACKLOG.md para manter o arquivo ativo enxuto (contexto de IA). NAO carregar este arquivo em sessoes de orquestracao, salvo consulta pontual de historico.

# Backlog de tarefas â€” escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` â†’ `EM_ANDAMENTO` â†’ (`BLOQUEADA`) â†’ `EM_REVISAO` â†’ `CONCLUIDA` | `CANCELADA`

## Modelo de tarefa

```markdown
### T-001 â€” TÃ­tulo curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Complexidade**: baixa | mÃ©dia | alta â€” define o modelo do executor/revisor (ver "Roteamento de modelos" no README.md)
- **Depende de**: â€” (ou T-xxx; tarefas com dependÃªncia nÃ£o paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe; link para prioridade no ORQUESTRADOR.md
- **Escopo**: o que fazer, arquivos-alvo provÃ¡veis
- **Fora de escopo**: o que NÃƒO fazer
- **CritÃ©rio de aceite**: verificÃ¡vel â€” "dado X, quando Y, entÃ£o Z" + comando de teste
- **Resultado**: (preenchido ao concluir: resumo, arquivos, testes rodados)
```

---

## Tarefas ativas

_(vazio â€” Ciclo 6 CONCLUÃDO E MERGEADO em 2026-07-25, PRs #69â€“#76. T-020/T-021 do ciclo 4 seguem em espera por decisÃ£o do humano.)_

## Ciclo 6 â€” Colheita das revisÃµes + ediÃ§Ã£o inline + Onda C â€” CONCLUÃDO E MERGEADO (2026-07-25)

> 8 tarefas em 3 ondas (A: T-029/T-030 paralelas + T-028 em sÃ©rie; B: T-031 + T-032 paralelas; C, aprovada pelo humano: T-033/T-034 paralelas + T-035 em sÃ©rie), todas revisadas, aprovadas e mergeadas via PRs #69â€“#76. Sanidade final na `main` (`fd407e6`): server 342 testes (25 arquivos) + web 113 testes (10 arquivos) + build verdes (o ciclo comeÃ§ou com 217+67).
> **Roteamento de modelos no ciclo**: executores Opus nas altas (T-028 normalizaÃ§Ã£o/migraÃ§Ã£o, T-031 ediÃ§Ã£o inline, T-035 recorrÃªncia), Sonnet nas mÃ©dias/baixas; revisores Opus em tudo que toca dinheiro/auth/migraÃ§Ã£o. 2 reprovaÃ§Ãµes no ciclo (T-033 histÃ³rico congelado pÃ³s-mutaÃ§Ã£o; T-035 materializaÃ§Ã£o retroativa â€” esta congelada em teste e contradizendo a prÃ³pria doc, sÃ³ visÃ­vel a revisÃ£o adversarial), ambas corrigidas na 1Âª re-entrega, sem escalar executor. Revisores Opus rodaram verificaÃ§Ãµes independentes (probes de corrida/rollback, cenÃ¡rios de migraÃ§Ã£o prÃ³prios).
> Higiene do repo no ciclo: `.gitattributes` (EOL LF) adicionado pelo orquestrador a partir de achado da T-028.
> Candidatas geradas pelas revisÃµes (nÃ£o urgentes): validaÃ§Ã£o de data real (`DATE_RE` aceita `2026-13-45` â€” POST e PATCH juntos); teste unitÃ¡rio de `isUniqueViolation`; POST de lanÃ§amento recorrente com 3 escritas nÃ£o transacionais; `AND user_id` no UPDATE final dos PATCH (defesa em profundidade); dedupe de fetches concorrentes do mesmo mÃªs; teste direto da varredura de boot das sessÃµes; fail-closed para `expires_at` corrompido; editar template de recorrÃªncia (decisÃ£o de produto); flicker de "Carregando" no histÃ³rico; `endMonth` do cliente para o fuso do histÃ³rico.

### T-033 â€” HistÃ³rico mensal no layer Despesas (Ãºltimos meses, sem grÃ¡fico)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#75](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/75) (2026-07-25). HistÃ³rico: REPROVADA na 1Âª revisÃ£o (bloqueante: histÃ³rico congelado apÃ³s criar/editar/excluir lanÃ§amento â€” dois valores monetÃ¡rios contraditÃ³rios na mesma tela); executor corrigiu (`refreshHistory()` nos 3 handlers, no caminho de sucesso) + aplicou sugestÃµes (breakdown visÃ­vel, 2 testes puros, `HISTORY_MONTHS` reposicionado) â†’ APROVADA na re-revisÃ£o. Janela de N meses consistente server/pura/UI, virada de ano coberta, `/summary` antes de `/:id`. SugestÃµes registradas: flicker de "Carregando" na revalidaÃ§Ã£o; guarda de resposta obsoleta prÃ³pria do `refreshHistory` (mesma classe do bug da T-030); fuso serverÃ—browser na virada de mÃªs (documentado, soluÃ§Ã£o futura: cliente envia `endMonth`). PÃ³s-merge: server 310 / web 101 / build verdes. Modelos: executor Sonnet, revisor Opus 5.
- **Prioridade**: P2
- **Complexidade**: mÃ©dia (endpoint agregado + seÃ§Ã£o de UI; revisor Opus por tocar dinheiro)
- **Depende de**: T-022 (mergeada)
- **Branch/worktree**: `giovane/t-033-historico-mensal`
- **Contexto**: escolha do humano para a Onda C. A navegaÃ§Ã£o mensal da T-022 mostra um mÃªs por vez; falta visÃ£o de tendÃªncia â€” total gasto nos Ãºltimos meses, no espÃ­rito da visÃ£o mensal do Organizze. Sem grÃ¡ficos (decisÃ£o do humano).
- **Escopo**: endpoint agregado `GET /api/expense-entries/summary?months=N` (default 6, cap 24) retornando total de lanÃ§amentos variÃ¡veis por mÃªs (`GROUP BY` do prefixo YYYY-MM, meses sem lanÃ§amento â†’ 0 ou omitidos, documentar); seÃ§Ã£o "Ãšltimos meses" na `DespesasPage` listando mÃªs a mÃªs o total (fixas atuais + variÃ¡veis do mÃªs, rotulando que as fixas sÃ£o as vigentes hoje â€” nÃ£o hÃ¡ histÃ³rico de fixas, comportamento documentado no CLAUDE.md); mÃªs corrente destacado; clique num mÃªs navega a navegaÃ§Ã£o mensal existente para ele; funÃ§Ã£o pura para montar as linhas com testes; testes de rota (agregaÃ§Ã£o correta, isolamento por user, validaÃ§Ã£o de `months`).
- **Fora de escopo**: grÃ¡ficos; histÃ³rico de despesas fixas; export.
- **CritÃ©rio de aceite**: com lanÃ§amentos conhecidos em 3 meses, a lista bate com o cÃ¡lculo manual; clique navega; suÃ­te + build verdes.
- **Resultado**: â€”

### T-034 â€” SessÃµes persistentes (login sobrevive a restart do server)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#74](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/74) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” conferiu no fonte do express-session que o roundtrip do cookie Ã© reidratado por `Store.createSession`; upsert/touch/comparaÃ§Ãµes ISO verificados; tabela sem superfÃ­cie HTTP; `data` nunca logado. `SqliteSessionStore` sem dependÃªncia nova; teste de integraÃ§Ã£o "restart" com 2Âª instÃ¢ncia real. Docblock contraditÃ³rio (achado nÂº1) corrigido pelo orquestrador antes do merge (`97be0d1`). SugestÃµes registradas: teste direto da varredura de boot (logout em massa seria o pior cenÃ¡rio); double-callback teÃ³rico se o callback lanÃ§ar sÃ­ncrono; `maxAge <= 0` cai no fallback 24h em vez de expirar; `expires_at` corrompido deveria ser fail-closed. Server 300 testes / web 95 / build verdes. Modelos: executor Sonnet, revisor Opus 5.
- **Prioridade**: P2
- **Complexidade**: mÃ©dia (infra de sessÃ£o; revisor Opus por tocar auth)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-034-sessoes-persistentes`
- **Contexto**: dÃ­vida conhecida do `CLAUDE.md`: `express-session` com MemoryStore perde todas as sessÃµes a cada restart do server â€” o usuÃ¡rio Ã© deslogado toda vez que o dev server reinicia.
- **Escopo**: store de sessÃ£o persistente no MESMO banco SQLite/libsql jÃ¡ usado (tabela `sessions` criada em `initDb()`), implementando a interface `Store` do express-session sobre `@libsql/client` (get/set/destroy/touch; TTL respeitando `cookie.maxAge`; limpeza de expiradas â€” lazy no get ou varredura no boot, documentar); sem dependÃªncia nova de driver se possÃ­vel (avaliar e justificar se precisar); config de `express-session` preservada (cookie `sid`, `secure` em produÃ§Ã£o, `SESSION_SECRET`); `CLAUDE.md` atualizado (dÃ­vida vira descriÃ§Ã£o do comportamento novo).
- **Fora de escopo**: Redis/Cognito; mudanÃ§as no fluxo de login/registro; rotaÃ§Ã£o de sessÃ£o.
- **CritÃ©rio de aceite**: teste do store (set/get/destroy/expiraÃ§Ã£o) com banco temp; login â†’ restart do server (novo processo no mesmo banco) â†’ sessÃ£o continua vÃ¡lida (teste de integraÃ§Ã£o ou roteiro manual documentado se restart real nÃ£o for testÃ¡vel na suÃ­te); suÃ­te + build verdes.
- **Resultado**: â€”

### T-035 â€” RecorrÃªncia de lanÃ§amentos de despesa (mensal)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#76](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/76) (2026-07-25). HistÃ³rico: REPROVADA na 1Âª revisÃ£o (bloqueante: recorrÃªncia criada de lanÃ§amento com data passada materializava retroativamente meses fechados â€” comportamento inclusive congelado em teste, contradizendo doc e UI); executor corrigiu (`start_month = max(mÃªs do lanÃ§amento, mÃªs corrente)`, teste "PAST entry does not backfill", suÃ­te reancorada em datas relativas) e aplicou TODAS as sugestÃµes (batch transacional com `isUniqueViolation`, throw em `lastInsertRowid` degenerado, horizonte +12 meses) â†’ APROVADA na re-revisÃ£o com 2 probes independentes do revisor contra o cÃ³digo compilado (rollback do batch; corrida real via Promise.all â†’ exatamente 1 ocorrÃªncia). Design: livro-razÃ£o `recurring_expense_months` UNIQUE(recurring_id, month) que sobrevive ao delete (excluir nÃ£o recria); ocorrÃªncias sÃ£o entries normais (editÃ¡veis pela T-031, sem dupla contagem); criaÃ§Ã£o acoplada ao POST. SugestÃµes remanescentes: teste unitÃ¡rio de `isUniqueViolation`; POST ainda com 3 escritas nÃ£o transacionais. Server 342 / web 113 / build verdes. Modelos: executor Opus 5, revisor Opus 5.
- **Prioridade**: P3
- **Complexidade**: alta (schema novo + materializaÃ§Ã£o idempotente â€” decisÃµes de design)
- **Depende de**: T-033 (mergeada â€” PR #75)
- **Branch/worktree**: `giovane/t-035-recorrencia`
- **Contexto**: escolha do humano para a Onda C (3Âª da sequÃªncia). Despesa variÃ¡vel que se repete todo mÃªs (assinatura, mensalidade) hoje precisa ser digitada mÃªs a mÃªs â€” ficou explicitamente fora da T-022.
- **Escopo**: marcar um lanÃ§amento como recorrente mensal na criaÃ§Ã£o/ediÃ§Ã£o (tabela prÃ³pria `recurring_expenses` ou flag + tabela de controle â€” decisÃ£o do executor, documentada); materializaÃ§Ã£o **lazy e idempotente**: ao consultar um mÃªs (GET por mÃªs), ocorrÃªncias pendentes daquele mÃªs sÃ£o geradas uma Ãºnica vez (chave Ãºnica por recorrÃªncia+mÃªs; dia do mÃªs ajustado para meses curtos, ex.: dia 31 â†’ Ãºltimo dia); encerrar recorrÃªncia (nÃ£o gera futuros; ocorrÃªncias passadas ficam); UI: checkbox "repetir todo mÃªs" no form + indicaÃ§Ã£o nos itens gerados + gestÃ£o mÃ­nima (listar/encerrar recorrÃªncias ativas); testes de materializaÃ§Ã£o (idempotÃªncia, mÃªs curto, encerramento, isolamento por user).
- **Fora de escopo**: recorrÃªncia em renda/poupanÃ§a; frequÃªncias alÃ©m de mensal; ediÃ§Ã£o em massa de ocorrÃªncias passadas.
- **CritÃ©rio de aceite**: criar recorrÃªncia em julho â†’ navegar para agosto gera a ocorrÃªncia 1x (re-navegar nÃ£o duplica); dia 31 em fevereiro cai no Ãºltimo dia; encerrar para de gerar; suÃ­te + build verdes.
- **Resultado**: â€”

> Aprovado pelo humano (2026-07-25): "pode seguir com a onda A". Onda A = T-029 + T-030 em paralelo (arquivos disjuntos), depois T-028 em sÃ©rie (conflita com T-029 nas rotas). Onda B = T-031 (ediÃ§Ã£o inline, aguarda Onda A). Onda C = escolha do humano entre histÃ³rico mensal em Despesas, sessÃµes persistentes ou recorrÃªncia de lanÃ§amentos. Humano validou o front do ciclo 5 sem erros; erros futuros viram tarefas de correÃ§Ã£o.

### T-028 â€” Normalizar categoria nas 3 telas de despesas/orÃ§amento
- **Status**: CONCLUIDA e MERGEADA â€” PR [#71](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/71) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” verificaÃ§Ã£o independente com cenÃ¡rio mais adversarial que o do executor (5 colidentes incl. colapso de espaÃ§o interno, NFCâ†”NFD dobram, isolamento entre usuÃ¡rios, initDb 4x idempotente, zero DELETE fora de budgets â€” tudo empÃ­rico). Forma canÃ´nica armazenada (NFC+trim+colapso+toLocaleLowerCase pt-BR); vencedor da colisÃ£o = maior id. SugestÃµes registradas: (1) categoria literal "sem categoria" gera grupo duplicado com mesmo label das vazias (key React duplicada â€” canto raro); (2) migraÃ§Ã£o destrutiva sem transaÃ§Ã£o/log por grupo (`db.batch` + log forense valeria); (3) fixar por teste o caso de 3+ colidentes e colisÃ£o por colapso de espaÃ§o; (4) `formatCategoryLabel` chamado 2x na mesma expressÃ£o; (5) `category ?? ''` sem trim era o comportamento antigo â€” mudanÃ§a colateral estritamente mais correta, registrada. Nota: alarme de CRLF era falso (blobs da main jÃ¡ eram CRLF); `.gitattributes` adicionado pelo orquestrador (`5387020`). Server 234 / web 82 / build e lint verdes. Modelos: executor Opus 5, revisor Opus 5.
- **Prioridade**: P1
- **Complexidade**: alta (migraÃ§Ã£o de dados do usuÃ¡rio + colisÃ£o possÃ­vel no UNIQUE de budgets)
- **Depende de**: T-029 (mergeada â€” PR #69)
- **Branch/worktree**: `giovane/t-028-normalizar-categoria`
- **Contexto**: achado nÂº 4 do revisor da T-023: a comparaÃ§Ã£o de categoria Ã© exata e case-sensitive nas 3 telas que usam texto livre (despesas fixas, lanÃ§amentos variÃ¡veis, orÃ§amentos) â€” "Mercado", "mercado" e "mercado " sÃ£o categorias diferentes; orÃ§amento de "Mercado" mostra 0% com gastos em "mercado". Pegadinha de usabilidade mais provÃ¡vel do app.
- **Escopo**: definir normalizaÃ§Ã£o canÃ´nica de categoria (no mÃ­nimo: trim + colapso de espaÃ§os internos + comparaÃ§Ã£o case-insensitive â€” a forma exata de armazenar/exibir Ã© decisÃ£o tÃ©cnica do executor, documentada) aplicada na **gravaÃ§Ã£o** das 3 rotas (`fixed_expenses.category`, `expense_entries.category`, `category_budgets.category`); migraÃ§Ã£o **idempotente** dos dados existentes no `initDb()` (atenÃ§Ã£o: normalizar `category_budgets` pode colidir no UNIQUE `(user_id, category)` â€” resolver de forma determinÃ­stica e documentada, ex.: manter o de maior `amount` ou o mais recente); agrupamento (`expensesGrouping.ts`) e `computeBudgetProgress` passam a comparar pela forma normalizada; atualizar `CLAUDE.md` (remover a nota de case-sensitive).
- **Fora de escopo**: autocomplete/select de categorias existentes; renomear categorias em massa pela UI.
- **CritÃ©rio de aceite**: testes â€” "Mercado" e "mercado " somam na mesma categoria no agrupamento e na barra de orÃ§amento; migraÃ§Ã£o roda 2x sem erro e resolve colisÃµes; upsert de budget com variaÃ§Ã£o de caixa substitui em vez de duplicar; suÃ­te inteira + build verdes.
- **Resultado**: â€”

### T-029 â€” Rejeitar valores nÃ£o finitos nas rotas de dinheiro (`Number.isFinite`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#69](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/69) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” verificou empiricamente que os 400 vÃªm da validaÃ§Ã£o (nÃ£o do body-parser) e que os testes falhariam sem o fix. 8 rotas corrigidas + suÃ­te de `alerts` criada do zero (rota nÃ£o tinha testes). MudanÃ§a de contrato intencional em `operations`: strings numÃ©ricas (`"5"`) deixam de ser aceitas (antes gravava TEXTO em coluna REAL â€” bug latente; front sempre enviou number). SugestÃµes registradas: cobrir `price: 1e999` (par -Infinity era redundante); documentar o contrato no CLAUDE.md; `import.ts` ainda aceita `"1e999"` â†’ **T-032**. Server 217 testes / web 63 / build verdes. Modelos: executor Sonnet, revisor Opus 5.
- **Prioridade**: P1
- **Complexidade**: mÃ©dia (mecÃ¢nica, mas em toda rota de dinheiro; revisor Opus por tocar dinheiro)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-029-isfinite-rotas-dinheiro`
- **Contexto**: achado recorrente dos revisores das T-022/T-023: as validaÃ§Ãµes usam `typeof === 'number' && !Number.isNaN` â€” `JSON.parse('1e999')` vira `Infinity`, passa, grava REAL infinito e volta como `null` no JSON, quebrando telas. DÃ­vida do repo inteiro.
- **Escopo**: trocar a validaÃ§Ã£o de todos os campos numÃ©ricos de dinheiro/quantidade por `Number.isFinite` (mantendo as regras existentes de `> 0` etc.) em TODAS as rotas que aceitam valores: `income`, `expenses`, `expense-entries`, `budgets`, `savings`, `goals` (`target_amount`/`current_amount`), `operations` (`quantity`/`price`) e `alerts` (`threshold`) se tiverem a mesma falha (verificar); 1 teste novo por rota cobrindo `Infinity` â†’ 400.
- **Fora de escopo**: mudar mensagens/formato de erro; validaÃ§Ã£o de strings; refatorar validaÃ§Ã£o para lib externa.
- **CritÃ©rio de aceite**: POST/PATCH com `1e999` (Infinity) e `-1e999` retorna 400 em todas as rotas de dinheiro, com teste; nenhum comportamento vÃ¡lido regride; suÃ­te inteira + build verdes.
- **Resultado**: â€”

### T-030 â€” Robustez de UI: respostas obsoletas, degradaÃ§Ã£o parcial e polimentos da Home
- **Status**: CONCLUIDA e MERGEADA â€” PR [#70](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/70) (2026-07-25). Revisor: APROVADA, 0 bloqueantes â€” guarda de mÃªs verificada linha a linha (ref antes do await, checado em sucesso E erro), gate de loading nÃ£o esconde aviso permanente, rename sem resÃ­duos (grep + TS strict). SugestÃ£o registrada: dedupe de chamadas concorrentes para o MESMO mÃªs (duplo clique) â€” tarefa futura. Web 67 testes / server 190 (intacto) / build verdes. Modelos: executor Sonnet, revisor Sonnet.
- **Prioridade**: P2
- **Complexidade**: mÃ©dia (sÃ³ web; estado assÃ­ncrono)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-030-robustez-ui`
- **Contexto**: sugestÃµes acumuladas dos revisores Opus do ciclo 5 (T-022 nÂº1-2, T-023 nÂº5-6, T-025 nÂº1-4) â€” todas de UI, nenhuma bloqueante, agrupadas numa tarefa sÃ³.
- **Escopo**: (a) `DespesasPage`: guarda de resposta obsoleta na navegaÃ§Ã£o de mÃªs (descartar resoluÃ§Ã£o cujo mÃªs â‰  mÃªs exibido) e hero com `â€”` em erro parcial de uma das fontes em vez de total subestimado; barra de orÃ§amento nÃ£o renderiza `spent` parcial durante loading; `fmtPct` nÃ£o arredondar 99,6% para "100%" sem alerta (floor ou 1 decimal); (b) `PoupancaPage`: falha sÃ³ em `getGoals` degrada o select de metas com aviso em vez de derrubar a tela; (c) `HomePage`: flag separada `entriesFailed` (sinalizaÃ§Ã£o de estimativa sÃ³ apÃ³s load real, nÃ£o no primeiro render), suprimir sublabel quando sobra real = prevista, aviso alinhado ao padrÃ£o `quotesUnavailable` (visÃ­vel, nÃ£o sÃ³ `title`), renomear `hasVariableEntries` â†’ `entriesLoaded`.
- **Fora de escopo**: mudanÃ§as no server; refatorar data-fetching para lib (react-query etc.); testes de componente/DOM.
- **CritÃ©rio de aceite**: funÃ§Ãµes puras alteradas/novas com testes (`computeMonthCashFlow` com a flag nova; helper de percentual); estados de erro/loading verificÃ¡veis por leitura do cÃ³digo e descritos no relatÃ³rio; suÃ­te web + build verdes.
- **Resultado**: â€”

### T-032 â€” Rejeitar valores nÃ£o finitos no import CSV (achado do revisor da T-029)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#72](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/72) (2026-07-25). Revisor: APROVADA, 0 achados â€” reverteu o fix temporariamente e confirmou que o teste falha sem ele. RejeiÃ§Ã£o por linha e validaÃ§Ã£o de SELL (T-019) intactas. Server 235 testes / build verde. Modelos: executor Sonnet, revisor Sonnet.
- **Prioridade**: P2
- **Complexidade**: baixa (uma rota, padrÃ£o jÃ¡ estabelecido pela T-029)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-032-isfinite-import-csv`
- **Contexto**: achado do revisor Opus da T-029: `server/src/routes/import.ts:41-44` usa `parseFloat` nos campos de valor do CSV â€” `"1e999"` vira `Infinity`, passa por `isNaN(...) || <= 0` e Ã© gravado. Ãšnico caminho de escrita de valor monetÃ¡rio que ainda aceita nÃ£o-finito.
- **Escopo**: trocar a checagem por `Number.isFinite` nos campos numÃ©ricos do parse do CSV (quantity/price), rejeitando a linha com erro no relatÃ³rio (`CsvImportResult.errors`), padrÃ£o das demais validaÃ§Ãµes por linha; teste com CSV contendo `1e999`.
- **Fora de escopo**: outras validaÃ§Ãµes do CSV; mudanÃ§as de formato.
- **CritÃ©rio de aceite**: linha com `1e999` rejeitada com erro por linha; linhas vÃ¡lidas do mesmo arquivo importam; suÃ­te verde.
- **Resultado**: â€”

### T-031 â€” EdiÃ§Ã£o inline nos layers bÃ¡sicos (PATCH em renda/despesas/lanÃ§amentos/poupanÃ§a)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#73](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/73) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” matriz typeÃ—goalId completa (todos os quadrantes testados, revincular confere as DUAS metas), zero testes antigos alterados (numstat), CLAUDE.md fiel parÃ¡grafo a parÃ¡grafo. SemÃ¢ntica central: invariantes do vÃ­nculo sobre o estado resultante; `{type:'YIELD', goalId:null}` juntos convertem aporte em rendimento. SugestÃµes registradas: (1) UPDATE final sem `AND user_id` repetido (TOCTOU teÃ³rico, padrÃ£o de goals.ts â€” defesa em profundidade barata); (2) ordenaÃ§Ã£o local vs server em empate de data; (3) `parseMoneyInput` com caminho morto de vÃ­rgula; (4) `current_amount` manual obsoleto ao desvincular Ãºltimo lanÃ§amento (prÃ©-existente da T-024 â€” agora alcanÃ§Ã¡vel por caminho novo); (5) `DATE_RE` aceita datas inexistentes (idÃªntico ao POST â€” endurecer os dois juntos em tarefa futura). Server 291 (+57) / web 95 (+13) / build verdes. Modelos: executor Opus 5, revisor Opus 5.
- **Prioridade**: P1
- **Complexidade**: alta (vÃ¡rias rotas de dinheiro + UI de ediÃ§Ã£o em 4 telas)
- **Depende de**: T-028, T-029 (mergeadas â€” PRs #71 e #69)
- **Branch/worktree**: `giovane/t-031-edicao-inline`
- **Contexto**: hoje tudo nos layers bÃ¡sicos Ã© criar/excluir â€” corrigir um valor exige apagar e recriar. Mobills/Organizze/Wallet tÃªm ediÃ§Ã£o em tudo. Maior funÃ§Ã£o bÃ¡sica ausente.
- **Escopo**: rotas `PATCH /api/income/:id`, `/api/expenses/:id`, `/api/expense-entries/:id`, `/api/savings/:id` (parciais, padrÃ£o do `PATCH /api/goals/:id`; savings vinculado a meta: editar `amount` reflete no progresso derivado â€” atenÃ§Ã£o Ã  consistÃªncia); UI de ediÃ§Ã£o inline (ou modal simples) nas 4 telas, reutilizando os forms existentes; validaÃ§Ã£o idÃªntica Ã  criaÃ§Ã£o (incluindo `Number.isFinite` da T-029 e categoria normalizada da T-028); testes de rota por campo + isolamento cross-user 404.
- **Fora de escopo**: editar operaÃ§Ãµes de aÃ§Ãµes (fora dos layers bÃ¡sicos, decisÃ£o futura); histÃ³rico/auditoria de ediÃ§Ãµes.
- **CritÃ©rio de aceite**: editar cada tipo de registro persiste e reflete nos totais/derivados (inclusive progresso de meta vinculada); PATCH cross-user â†’ 404; suÃ­te inteira + build verdes.
- **Resultado**: â€”

## Ciclo 5 â€” Melhorias dos layers bÃ¡sicos â€” CONCLUÃDO E MERGEADO (2026-07-25)

> 6 tarefas executadas em 2 ondas (A: T-022, T-024, T-026, T-027 em paralelo; B: T-023, T-025 apÃ³s integraÃ§Ã£o da T-022), todas revisadas, aprovadas e mergeadas via PRs #63â€“#68. Sanidade final na `main` (`39ba7d0`): server 190 testes (18 arquivos) + web 63 testes (7 arquivos) + build completo verdes.
> **Primeiro ciclo com roteamento de modelos**: executores Opus 5 nas tarefas altas (T-022, T-024), Sonnet nas mÃ©dias/baixas; revisores Opus nas que tocam dinheiro (T-022, T-023, T-024, T-025). 1 reprovaÃ§Ã£o no ciclo inteiro (T-027, auto-criaÃ§Ã£o espÃºria em falha de rede â€” corrigida na 1Âª re-entrega, sem precisar escalar executor). Incidente do orquestrador: marcador de conflito residual no CLAUDE.md ao integrar a T-024, detectado pelo revisor Opus da T-023 e corrigido (`0c0cd84`) â€” liÃ§Ã£o: conferir `git diff --check`/grep de marcadores apÃ³s toda resoluÃ§Ã£o manual.
> Candidatas geradas pelas revisÃµes (nÃ£o urgentes): normalizaÃ§Ã£o de categoria entre Despesas/LanÃ§amentos/OrÃ§amentos (case-sensitive hoje); `Number.isFinite` em `amount` em todas as rotas de dinheiro (aceitam `Infinity` â€” dÃ­vida do repo inteiro); guarda de resposta obsoleta na navegaÃ§Ã£o de mÃªs da DespesasPage; semÃ¢ntica do retorno a MANUAL quando o Ãºltimo vÃ­nculo de meta Ã© apagado; `Promise.all` da PoupancaPage derruba a tela se sÃ³ `/api/goals` falhar; polimentos do sublabel de estimativa na Home.

> Pedido do humano (2026-07-24): melhorar os layers bÃ¡sicos (Renda, Despesas, PoupanÃ§a, Metas â€” **fora** AÃ§Ãµes e Cripto), usando como referÃªncia apps de wallet existentes: **Mobills** (metas financeiras, controle de gastos), **Organizze** (simplicidade, visÃ£o mensal, mÃºltiplas contas) e **Wallet/BudgetBakers** (orÃ§amento flexÃ­vel por categoria). Diretriz vigente: melhorar funÃ§Ãµes bÃ¡sicas antes de cripto/aÃ§Ãµes. Open Finance/sincronizaÃ§Ã£o bancÃ¡ria ficou **fora** â€” inviÃ¡vel no escopo local atual (exigiria credenciais, agregador pago e infraestrutura).
>
> Inclui tambÃ©m duas tarefas decorrentes de decisÃµes jÃ¡ tomadas pelo humano no `TODO-HUMANO.md` (opÃ§Ã£o b para alertas/import; carteira Ãºnica).
>
> **Ondas propostas**: Onda A = T-022, T-024, T-026, T-027 (independentes entre si). Onda B = T-023, T-025 (dependem da T-022).

### T-022 â€” LanÃ§amentos de despesas variÃ¡veis com data e visÃ£o mensal (`/despesas`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#64](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/64) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” isolamento por user_id nas 3 rotas, SQL 100% parametrizado, timezone BRT com testes de borda, schema idempotente fiel ao CLAUDE.md. 15 testes de rota + 12 de funÃ§Ãµes puras; server 162 / web 31 / build verdes. SugestÃµes nÃ£o bloqueantes registradas: (1) navegaÃ§Ã£o de mÃªs sem guarda de resposta obsoleta (cliques rÃ¡pidos podem exibir mÃªs errado transitÃ³rio); (2) hero soma fonte com erro como 0 em erro parcial; (3) `defaultEntryDate` em UTC (padrÃ£o prÃ©-existente do repo â€” `OperationForm`/`PoupancaPage` idem); (4) `substr` nÃ£o-sargable documentado; (5) `amount` aceita `Infinity` (dÃ­vida do repo inteiro â€” `expenses`/`savings` idem). Modelos: executor Opus 5, revisor Opus 5.
- **Prioridade**: P1
- **Complexidade**: alta (schema novo + rotas + navegaÃ§Ã£o mensal na UI; base para T-023/T-025)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-022-despesas-variaveis`
- **Contexto**: hoje o layer Despesas sÃ³ tem itens **fixos mensais** (`fixed_expenses`), sem data. O coraÃ§Ã£o de Mobills/Organizze Ã© registrar os gastos do dia a dia com data e categoria e navegar por mÃªs â€” sem isso nÃ£o existe fluxo de caixa real, orÃ§amento por categoria nem comparaÃ§Ã£o entre meses.
- **Escopo**: tabela `expense_entries` (`user_id`, `description`, `category`, `amount`, `date` YYYY-MM-DD, `created_at`); rotas `GET /api/expense-entries?month=YYYY-MM` (default mÃªs corrente), `POST`, `DELETE /:id` com `requireAuth` e isolamento por `user_id` (padrÃ£o de `expenses.ts`); tipos em `shared/`; funÃ§Ãµes em `web/src/api.ts`; UI do layer Despesas ganha duas seÃ§Ãµes â€” "Fixas do mÃªs" (existente) e "LanÃ§amentos do mÃªs" (lista com data/categoria/valor, form de adiÃ§Ã£o, excluir) â€” com navegaÃ§Ã£o â€¹ mÃªs anterior / prÃ³ximo â€º e **total do mÃªs = fixas + variÃ¡veis**; `CLAUDE.md` atualizado (schema + rotas).
- **Fora de escopo**: orÃ§amento por categoria (T-023); recorrÃªncia automÃ¡tica; ediÃ§Ã£o inline; import de extrato.
- **CritÃ©rio de aceite**: testes de rota cobrindo criaÃ§Ã£o, filtro por mÃªs (lanÃ§amento de junho nÃ£o aparece em julho), isolamento cross-user (404), validaÃ§Ã£o de payload (400); na UI, total do mÃªs bate com fixas + variÃ¡veis do mÃªs exibido; navegaÃ§Ã£o entre meses funciona; suÃ­te inteira + build verdes.
- **Resultado**: â€”

### T-023 â€” OrÃ§amento mensal por categoria com barra de progresso
- **Status**: CONCLUIDA e MERGEADA â€” PR [#68](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/68) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” verificou com `@libsql/client` real que o upsert de um usuÃ¡rio nÃ£o toca a linha do outro e que o DDL Ã© idempotente; percentual real preservado com clamp sÃ³ visual. 9 testes de rota + 7 de funÃ§Ã£o pura. SugestÃµes nÃ£o bloqueantes registradas: (1) `Number.isFinite` em `amount` (aceita `Infinity` â€” mesmo padrÃ£o de `goals.ts`, corrigir juntos); (2) teste de upsert cross-user com MESMA categoria; (3) comentÃ¡rio do Ã­ndice diz "expression-based" mas Ã© composto simples; (4) **normalizaÃ§Ã£o de categoria entre as 3 telas** (case-sensitive hoje â€” pegadinha de usabilidade mais provÃ¡vel, candidata a tarefa futura); (5) barra pode piscar valor subestimado durante loading; (6) `fmtPct` arredonda 99,6%â†’"100%" sem cor de alerta; (7) revisor detectou marcador de conflito residual no CLAUDE.md da main (erro do orquestrador na integraÃ§Ã£o da T-024) â€” corrigido em `0c0cd84` antes deste merge. Conflito de CLAUDE.md com T-025 resolvido na integraÃ§Ã£o (`4691525`). Modelos: executor Sonnet, revisor Opus 5.
- **Prioridade**: P2
- **Complexidade**: mÃ©dia (padrÃ£o CRUD existente + 1 cÃ¡lculo puro; revisor Opus por tocar dinheiro)
- **Depende de**: T-022 (mergeada â€” PR #64)
- **Branch/worktree**: `giovane/t-023-orcamento-categoria`
- **Contexto**: recurso central do Wallet/BudgetBakers ("orÃ§amento flexÃ­vel") e do Mobills: o usuÃ¡rio define um teto de gasto por categoria e acompanha o consumo no mÃªs.
- **Escopo**: tabela `category_budgets` (`user_id`, `category` UNIQUE por usuÃ¡rio, `amount`); rotas `GET /api/budgets`, `POST` (upsert por categoria), `DELETE /:id`; tipos em `shared/`; no layer Despesas, seÃ§Ã£o "OrÃ§amento do mÃªs": para cada categoria com orÃ§amento, barra fina (padrÃ£o visual das metas) com gasto do mÃªs (lanÃ§amentos T-022 + fixas da categoria) vs teto, percentual e cor de alerta ao passar de 100% (token `--color-warn`/down); funÃ§Ã£o pura `computeBudgetProgress` com testes no web.
- **Fora de escopo**: orÃ§amento total do mÃªs (deriva da home/T-025); rollover de saldo entre meses; notificaÃ§Ãµes.
- **CritÃ©rio de aceite**: com orÃ§amento de R$ 500 em "mercado" e lanÃ§amentos conhecidos somando R$ 350, a barra mostra 70%; ao exceder, 100%+ sinalizado; testes de rota (upsert substitui, isolamento por user) e da funÃ§Ã£o pura verdes; suÃ­te + build verdes.
- **Resultado**: â€”

### T-024 â€” Aportes de poupanÃ§a vinculados a metas (progresso derivado)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#66](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/66) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” verificou por conta prÃ³pria initDb() idempotente (2x sem erro), FK aplicada pelo libsql e atomicidade do `db.batch` em cenÃ¡rio de falha (UPDATE revertido). DecisÃµes validadas: YIELD+goalIdâ†’400, progresso derivado nÃ£o materializado (2 queries, sem N+1), piso 0 + centavos, SavingsSummary intocado. Conflito de CLAUDE.md com T-022 resolvido pelo orquestrador (`d4b3299`, duas seÃ§Ãµes mantidas; 181 testes + build verdes no worktree pÃ³s-merge). SugestÃµes nÃ£o bloqueantes registradas: (1) `user_id` redundante no UPDATE do batch Ã© o Ãºnico caminho para 500 no DELETE de meta; (2) `getGoalWithProgress` pode devolver null em corrida (retornar 404); (3) apagar o Ãºltimo vÃ­nculo devolve a meta a MANUAL com `current_amount` congelado â€” decidir/documentar; (4) `Promise.all` na PoupancaPage derruba a tela se sÃ³ `/api/goals` falhar; (5) bug prÃ©-existente do GoalCard (T-010) segue aberto, agora sÃ³ afeta metas manuais. Modelos: executor Opus 5, revisor Opus 5.
- **Prioridade**: P2
- **Complexidade**: alta (mexe no modelo de metas + poupanÃ§a, dinheiro e retrocompatibilidade)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-024-metas-aportes`
- **Contexto**: no Mobills, meta Ã© algo que vocÃª **alimenta com aportes**, nÃ£o um nÃºmero editado Ã  mÃ£o. Hoje `goals.current_amount` Ã© manual e desconectado da poupanÃ§a â€” o usuÃ¡rio registra o depÃ³sito em `/poupanca` e depois atualiza a meta manualmente, em dobro.
- **Escopo**: coluna opcional `goal_id INTEGER REFERENCES goals(id)` em `savings_entries` (ALTER idempotente no `initDb()`); `POST /api/savings` aceita `goalId` opcional (validar que a meta Ã© do usuÃ¡rio); para metas **com** lanÃ§amentos vinculados, `GET /api/goals` retorna `current_amount` **derivado** (DEPOSIT âˆ’ WITHDRAW vinculados; YIELD fora) â€” metas sem vÃ­nculo mantÃªm o manual (retrocompatibilidade); tipos em `shared/`; UI: form de lanÃ§amento da PoupanÃ§a ganha select opcional "Vincular Ã  meta", tela de Metas indica progresso automÃ¡tico vs manual (PATCH de `current_amount` bloqueado com 400 explicativo para metas com vÃ­nculo); `CLAUDE.md` atualizado.
- **Fora de escopo**: transferÃªncia de saldo entre metas; rateio de YIELD entre metas; migraÃ§Ã£o de dados histÃ³ricos.
- **CritÃ©rio de aceite**: teste â€” DEPOSIT de 100 com `goalId` â†’ meta reflete 100; WITHDRAW de 30 vinculado â†’ 70; meta sem vÃ­nculo segue manual e PATCH funciona; PATCH em meta vinculada â†’ 400; lanÃ§amento com meta de outro usuÃ¡rio â†’ 404; suÃ­te + build verdes.
- **Resultado**: â€”

### T-025 â€” Fluxo de caixa do mÃªs na Home (sobra real, nÃ£o estimada)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#67](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/67) (2026-07-25). Revisor Opus: APROVADA, 0 bloqueantes â€” cÃ¡lculo sem dupla subtraÃ§Ã£o, fallback sem NaN, `Promise.allSettled` no padrÃ£o da T-008, reuso total da T-022, fuso local. SugestÃµes nÃ£o bloqueantes registradas: (1) sinalizaÃ§Ã£o de estimativa aparece por instantes no primeiro carregamento (gate por `!loading`); (2) sublabel redundante quando real = prevista; (3) `*` sem legenda visÃ­vel (sÃ³ `title` â€” invisÃ­vel em touch; parcial vs padrÃ£o `quotesUnavailable`); (4) renomear `hasVariableEntries` â†’ `entriesLoaded`. Merge da main (T-024/T-027) auto-limpo; sanidade pÃ³s-merge: web 56 testes + build verdes. Modelos: executor Sonnet, revisor Opus 5.
- **Prioridade**: P2
- **Complexidade**: mÃ©dia (agregaÃ§Ã£o no front sobre APIs prontas; funÃ§Ã£o pura testÃ¡vel)
- **Depende de**: T-022 (mergeada â€” PR #64)
- **Branch/worktree**: `giovane/t-025-sobra-real-home`
- **Contexto**: a home mostra "Sobra do mÃªs" = renda âˆ’ despesas fixas (estimativa estÃ¡tica). Com os lanÃ§amentos datados da T-022 dÃ¡ para mostrar a sobra **real** do mÃªs corrente, no espÃ­rito da visÃ£o mensal do Organizze.
- **Escopo**: hero da home passa a exibir sobra real = renda âˆ’ fixas âˆ’ lanÃ§amentos variÃ¡veis do mÃªs corrente, com sublabel comparando Ã  sobra prevista (renda âˆ’ fixas); card de Despesas na home mostra o total do mÃªs (fixas + variÃ¡veis); lÃ³gica em funÃ§Ã£o pura (`homeMetrics.ts` ou mÃ³dulo novo) com testes no runner do web; sem grÃ¡ficos (decisÃ£o do humano: cancelados).
- **Fora de escopo**: histÃ³rico multi-mÃªs na home; projeÃ§Ãµes; grÃ¡ficos.
- **CritÃ©rio de aceite**: testes da funÃ§Ã£o pura com cenÃ¡rios conhecidos (sem lanÃ§amentos â†’ sobra real = prevista; com lanÃ§amentos â†’ subtrai corretamente; mÃªs virou â†’ zera); valores pt-BR/BRL; suÃ­te web + build verdes.
- **Resultado**: â€”

### T-026 â€” Ocultar Alertas e Import CSV do dashboard (decisÃ£o "b" do humano)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#63](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/63) (2026-07-24). Revisor: APROVADA, 0 achados â€” diff toca sÃ³ `DashboardPage.tsx` + `CLAUDE.md`; componentes/rotas intactos; remoÃ§Ã£o de `refreshWallets` verificada sem quebra (refresh pÃ³s-operaÃ§Ã£o nÃ£o dependia dele). SuÃ­tes 147+19 e build verdes. Modelos: executor Sonnet, revisor Sonnet.
- **Prioridade**: P3
- **Complexidade**: baixa (remoÃ§Ã£o de render, arquivos e rotas intactos)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-026-ocultar-alertas-import`
- **Contexto**: decisÃ£o registrada no `TODO-HUMANO.md` (2026-07-24, opÃ§Ã£o b): esconder da UI e redesenhar depois. A T-013 jÃ¡ tirou o BenchmarkComparison; `AlertsPanel` e `CsvImport` continuam no dashboard.
- **Escopo**: remover `AlertsPanel` e `CsvImport` do render de `DashboardPage`/`PortfolioDashboard`; **manter** arquivos de componente e rotas do server intactos (voltam num redesign futuro); nota no `CLAUDE.md` de que as rotas seguem ativas sem UI.
- **Fora de escopo**: apagar componentes/rotas/testes; redesign dos recursos.
- **CritÃ©rio de aceite**: dashboard sem os dois blocos; rotas `/api/alerts` e `/api/import` continuam respondendo (testes existentes verdes); build web ok. Justificativa de teste: remoÃ§Ã£o de UI sem lÃ³gica nova.
- **Resultado**: â€”

### T-027 â€” Modo carteira Ãºnica: fluxo direto para o dashboard (decisÃ£o do humano)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#65](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/65) (2026-07-25). HistÃ³rico: REPROVADA na 1Âª revisÃ£o (bloqueante: falha de rede no primeiro `getWallets()` auto-criava carteira "Principal" espÃºria â€” `walletsLoaded=true` via `finally` com lista vazia); executor corrigiu com `walletsLoadError` no ShellContext + aÃ§Ã£o `error` em `decideWalletFlow` + tela de retry (4 testes novos no ramo de erro) â†’ APROVADA na re-revisÃ£o. `decideWalletFlow` pura com 10 testes; escape do loop de redirect via `?manage=1`; backend intacto. Merge limpo com T-026 (mesmo `DashboardPage.tsx`); sanidade pÃ³s-merge na main: web 41 testes + build verdes. Modelos: executor Sonnet, revisor Sonnet.
- **Prioridade**: P3
- **Complexidade**: mÃ©dia (fluxo de navegaÃ§Ã£o + criaÃ§Ã£o automÃ¡tica; backend intacto)
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-027-carteira-unica`
- **Contexto**: decisÃ£o do humano (2026-07-24): "uma carteira sÃ³ resolve â€” nÃ£o precisa da page de vÃ¡rias carteiras". SimplificaÃ§Ã£o alinhada ao Organizze (menos passos atÃ© o dado).
- **Escopo**: usuÃ¡rio sem carteira ganha uma "Principal" criada automaticamente no primeiro acesso ao layer AÃ§Ãµes (front chama o POST existente); usuÃ¡rio com exatamente 1 carteira: card "AÃ§Ãµes" da home e rota `/carteiras` levam **direto** ao `/dash/:id` da Ãºnica carteira (redirect); usuÃ¡rio com 2+ carteiras (dados legados): pÃ¡gina `/carteiras` continua funcionando como hoje; **backend multi-wallet intacto** (nenhuma mudanÃ§a de schema/rotas).
- **Fora de escopo**: remover tabela/rotas de wallets; migrar/mesclar carteiras existentes; excluir a pÃ¡gina `/carteiras`.
- **CritÃ©rio de aceite**: fluxo novo usuÃ¡rio â†’ home â†’ AÃ§Ãµes cai direto num dashboard funcional sem passar por criaÃ§Ã£o manual; com 1 carteira, `/carteiras` redireciona; com 2+, comportamento atual preservado; lÃ³gica de decisÃ£o extraÃ­da em funÃ§Ã£o pura com teste no web; build verde.
- **Resultado**: â€”

## Ciclo 4 â€” Onda A CONCLUÃDA E MERGEADA (2026-07-24)

> Humano ativou modo auto (orquestrador sequencia tarefas, PRs e merges automÃ¡ticos, reporta ao fim). T-019 + T-016 executadas em paralelo (worktrees isoladas), ambas APROVADAS pelo revisor com 0 bloqueantes e mergeadas (PRs #61 e #62). Sanidade final na `main` (`60011b0`): server 147 testes (15 arquivos) + web 19 testes (3 arquivos) verdes. PrÃ³ximas: T-020/T-021 bloqueadas por decisÃ£o do humano (`TODO-HUMANO.md`).

### T-016 â€” P&L diÃ¡rio real nos cards de carteira (via `quote_snapshots`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#62](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/62) (2026-07-24). Revisor: APROVADA, 0 bloqueantes â€” cÃ¡lculo confere com manual em testes, SQL parametrizado, retrocompatibilidade de `buildPortfolioSummary` via parÃ¢metro opcional, chip com fallback correto. Entrega: `computeDayProfitLoss` (pura) + `getPreviousCloseSnapshots` + `dayProfitLoss`/`dayProfitLossPct` no `PortfolioSummary` + chip "hoje"/fallback "total" no `WalletSelector` (`walletChip.ts` puro com testes). SemÃ¢ntica conservadora: qualquer ticker ativo sem snapshot anterior ou cotaÃ§Ãµes falhas â†’ campos null. Ressalva prÃ©-existente registrada: `date(captured_at)` UTC vs data BRT em `snapshots.ts` (padrÃ£o antigo, candidata futura).
- **Branch/worktree**: `giovane/t-016-pnl-diario` (commit `793b321`)
_(item completo mais abaixo, na seÃ§Ã£o do ciclo 3 â€” transferido)_

### T-019 â€” Validar SELL do import CSV por `wallet_id`
- **Status**: CONCLUIDA e MERGEADA â€” PR [#61](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/61) (2026-07-24). Revisor: APROVADA, 0 bloqueantes â€” filtro parametrizado, comportamento sem `walletId` preservado, teste multi-carteira cobre o critÃ©rio (SELL 100 rejeitado com 50+50 entre carteiras; SELL 50 aceito). SuÃ­te server: 133 testes. Ressalva nÃ£o bloqueante prÃ©-existente: `Number(req.query.walletId)` sem validaÃ§Ã£o de NaN (mesmo padrÃ£o de `operations.ts`) â€” candidata a limpeza futura.
- **Branch/worktree**: `giovane/t-019-sell-csv-wallet` (commit `fdc3a0b`)
- **Prioridade**: P1 (lacuna de corretude encontrada pelo revisor da T-014)
- **Contexto**: `server/src/routes/import.ts` valida SELL contra a posiÃ§Ã£o somada de TODAS as carteiras do usuÃ¡rio (a query nÃ£o filtra por `wallet_id`, ao contrÃ¡rio de `operations.ts`). UsuÃ¡rio com mÃºltiplas carteiras pode importar um SELL que excede a posiÃ§Ã£o da carteira alvo sem rejeiÃ§Ã£o.
- **Escopo**: filtrar a query de posiÃ§Ã£o do import por `wallet_id` quando informado; teste de rota cobrindo o cenÃ¡rio multi-carteira; revisar o texto correspondente no `CLAUDE.md`.
- **CritÃ©rio de aceite**: CSV com SELL que excede a posiÃ§Ã£o da carteira alvo (mas coberto pela soma das carteiras) Ã© rejeitado por linha; suÃ­te verde.

## Fila restante do ciclo 4 (bloqueada por decisÃ£o do humano â€” ver `TODO-HUMANO.md`)

### T-020 â€” Logo oficial no header e na AuthPage (residual da antiga prioridade 4)
- **Status**: PENDENTE
- **Prioridade**: P3
- **Contexto**: a T-018 entregou favicon/head com a `logo-vetor-wallet.png`; falta decidir/exibir a logo oficial junto ao wordmark nas telas (hoje o header usa os mascotes por layer, decisÃ£o do design v4 â€” pode ser que a logo oficial fique sÃ³ na landing/auth). **DecisÃ£o de UX pendente do humano**: mascotes vs logo oficial no header.
- **Escopo**: conforme decisÃ£o do humano no `TODO-HUMANO.md`.

### T-021 â€” ValidaÃ§Ã£o de SELL por data histÃ³rica (avaliar)
- **Status**: PENDENTE (avaliar se vale o custo)
- **Prioridade**: P3
- **Contexto**: ressalva do revisor da T-014: a validaÃ§Ã£o atual usa a posiÃ§Ã£o consolidada ATUAL; um SELL retroativo pode criar histÃ³rico com posiÃ§Ã£o negativa em datas intermediÃ¡rias (documentado como decisÃ£o consciente no `CLAUDE.md`).
- **Escopo**: validar a posiÃ§Ã£o na data da operaÃ§Ã£o (e nas datas seguintes). Custo/benefÃ­cio a decidir.

### Outras candidatas (do `TODO-HUMANO.md`, aguardando ordenaÃ§Ã£o do humano)
- Ampliar `/admin` (antiga prioridade 3 do `ORQUESTRADOR.md`).
- Backend de criptomoedas (tela Ã© mock).
- SessÃµes persistentes (MemoryStore â†’ store real) e agendador do job de insights (Lambda/EventBridge) â€” dÃ­vidas de produÃ§Ã£o conhecidas.

## Ciclo 3 â€” CONCLUÃDO E MERGEADO (2026-07-24)

> **Robustez e dÃ­vidas tÃ©cnicas** â€” 4 tarefas executadas (T-014, T-015, T-017, T-018), todas revisadas, aprovadas e mergeadas via PRs #57â€“#60; T-016 transferida para o ciclo 4 (humano pediu encerramento). Sanidade final na `main`: server 132 testes (15 arquivos) + web 13 testes (2 arquivos) + build completo verdes; porta 3001 livre.
> Incidente resolvido no inÃ­cio do ciclo: server "quebrando" era processo Ã³rfÃ£o de smoke test segurando a porta 3001 (`EADDRINUSE`) â€” morto; regra operacional adicionada aos prompts de executor (encerrar servidores dev e confirmar porta livre).
> Humano validou o app v4 ("deu bom"). Incidente diagnosticado e resolvido pelo orquestrador antes do ciclo: server "quebrando" era processo Ã³rfÃ£o de smoke test (worktree da T-009) segurando a porta 3001 â†’ `EADDRINUSE`; processo morto, server da `main` sobe limpo. LiÃ§Ã£o operacional: executores NÃƒO devem deixar servidores dev rodando ao terminar.
> Ondas: A = T-014, T-015, T-017, T-018 (independentes). B = T-016 (toca `portfolio.ts`/tipos como T-014/T-015 â€” em sÃ©rie).

### T-014 â€” Rejeitar venda maior que a posiÃ§Ã£o (validaÃ§Ã£o de SELL)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#57](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/57). Descoberta confirmada pelo revisor via git log: a validaÃ§Ã£o JÃ EXISTIA (`wouldExceedPosition`, desde `7e93d66`) e a dÃ­vida do CLAUDE.md estava desatualizada; o diff entrega 8 testes de rota (operations 5, import 3) + doc corrigida. Lacuna prÃ©-existente achada pelo revisor â†’ **T-019** na fila do ciclo 4 (CSV nÃ£o filtra por wallet_id); semÃ¢ntica temporal â†’ **T-021**.
- **Prioridade**: P1
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-014-validacao-sell`
- **Contexto**: dÃ­vida conhecida do `CLAUDE.md`/`ORQUESTRADOR.md`: `portfolio.ts` usa `Math.max(0, newQty)` â€” vender mais do que se possui trunca silenciosamente para zero em vez de rejeitar.
- **Escopo**: em `POST /api/operations` (e no import CSV, se aplicÃ¡vel), validar no server: para SELL, a quantidade vendida nÃ£o pode exceder a posiÃ§Ã£o do ticker na carteira/usuÃ¡rio na data considerada (usar o cÃ¡lculo de posiÃ§Ã£o existente em `services/portfolio.ts`); exceder â†’ 400 com mensagem clara. Remover/ajustar o truncamento `Math.max(0, newQty)` conforme fizer sentido apÃ³s a validaÃ§Ã£o. Exibir o erro no form do front (o `OperationForm` jÃ¡ mostra erros da API). Atualizar "Pontos de atenÃ§Ã£o" do `CLAUDE.md` (remover a dÃ­vida).
- **Fora de escopo**: short selling; ediÃ§Ã£o de operaÃ§Ãµes; UI alÃ©m de exibir o erro existente.
- **CritÃ©rio de aceite**: testes de rota: SELL vÃ¡lido passa; SELL > posiÃ§Ã£o retorna 400 e nÃ£o grava; SELL igual Ã  posiÃ§Ã£o zera; CSV com SELL invÃ¡lido rejeita a linha ou o arquivo com mensagem (documentar a escolha); suÃ­te inteira verde.
- **Resultado**: â€”

### T-015 â€” Sinalizar falha de cotaÃ§Ãµes em vez de falhar silenciosamente
- **Status**: CONCLUIDA e MERGEADA â€” PR [#59](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/59) (APROVADA, 0 bloqueantes: `fetchQuotes` â†’ `{quotes, failed}`, `PortfolioSummary.quotesUnavailable?` opcional, banner warn no dashboard com fallback antigo preservado, benchmarks ajustado; 9 testes novos)
- **Prioridade**: P1
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-015-sinal-falha-cotacoes`
- **Contexto**: dÃ­vida conhecida: `fetchQuotes` retorna `Map` vazio em qualquer erro de rede/API; a UI mostra `null` sem avisar.
- **Escopo**: `services/quotes.ts` distingue "sem cotaÃ§Ã£o para o ticker" de "falha na busca" (ex.: retorno `{ quotes, failed: boolean|tickersFalhos }`); `GET /api/portfolio` propaga um campo `quotesUnavailable`/equivalente no `PortfolioSummary` (tipo em `shared/`); front (dashboard e home) exibe aviso discreto quando cotaÃ§Ãµes indisponÃ­veis (a home jÃ¡ tem a flag `*` de fallback â€” integrar). Testes: mock de falha da brapi â†’ summary com flag; mock ok â†’ sem flag.
- **Fora de escopo**: retry/cache de cotaÃ§Ãµes; mudanÃ§as no layout alÃ©m do aviso.
- **CritÃ©rio de aceite**: com brapi inacessÃ­vel (mock), `GET /api/portfolio` responde 200 com flag e o dashboard mostra o aviso; suÃ­te inteira verde; `CLAUDE.md` "Pontos de atenÃ§Ã£o" atualizado.
- **Resultado**: â€”

### T-017 â€” Test runner no web (issue #6)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#58](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/58) (APROVADA: Vitest no web, 10 testes de homeMetrics migrados byte-a-byte do server, `groupByCategory` extraÃ­do com 3 testes novos; web 13 testes / server sem os migrados; CLAUDE.md atualizado â€” **issue #6 fechÃ¡vel**)
- **Prioridade**: P2
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-017-web-test-runner`
- **Contexto**: web nunca teve runner; o ciclo 2 contornou testando funÃ§Ãµes puras via Vitest do server (`server/src/services/homeMetrics.test.ts` importa de `web/src/`). Fechar a issue #6.
- **Escopo**: configurar Vitest no pacote `web` (script `test`, config coerente com Vite/ESM; jsdom sÃ³ se necessÃ¡rio â€” comeÃ§ar por funÃ§Ãµes puras); migrar `homeMetrics.test.ts` do server para `web/src/routes/homeMetrics.test.ts` (e remover o `exclude` do `server/tsconfig.json` se ficar sem uso â€” verificar); escrever ao menos 1 teste novo de funÃ§Ã£o pura existente do web para provar o setup; atualizar `CLAUDE.md` (polÃ­tica de testes: padrÃ£o web agora ativo) e raiz `package.json` se houver script agregador.
- **Fora de escopo**: testes de componente/E2E; cobertura ampla (vem nas prÃ³ximas tarefas).
- **CritÃ©rio de aceite**: `pnpm --filter vetor-wallet-web test` verde com os testes migrados+novo; `pnpm --filter vetor-wallet-server test` continua verde (nada perdido na migraÃ§Ã£o); builds ok.
- **Resultado**: â€”

### T-018 â€” Favicon e identidade no `<head>` (tÃ­tulo, meta, Ã­cone)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#60](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/60) (APROVADA: favicon 32px + apple-touch-icon 180px gerados da logo oficial `logo-vetor-wallet.png` â€” decisÃ£o fundamentada na prioridade 4 do ORQUESTRADOR.md; title/description/theme-color; prÃ©-paint intocado; ressalva `sizes` corrigida pelo orquestrador. Residual da logo nas telas â†’ **T-020**)
- **Prioridade**: P3
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-018-favicon-head`
- **Contexto**: resquÃ­cio da antiga prioridade 4: o app v4 usa os mascotes como logo nas telas, mas o favicon/`<title>` do `index.html` seguem os defaults do Vite.
- **Escopo**: gerar favicon a partir do mascote `receitas-t.png` (PNG 32/180 + `apple-touch-icon`; formato simples, sem pipeline novo), `<title>` "vetor wallet", `meta description` e `theme-color` coerentes com os tokens (light/dark). Conferir se existe `logo-vetor-wallet.png` no repo e decidir entre ele e o mascote (documentar a escolha no relatÃ³rio).
- **Fora de escopo**: mudanÃ§as nas telas; manifest PWA.
- **CritÃ©rio de aceite**: favicon visÃ­vel no dev server e no build; sem regressÃ£o no prÃ©-paint de tema do `index.html`; build web ok. Teste dispensado (asset/HTML estÃ¡tico).
- **Resultado**: â€”

### T-016 â€” P&L diÃ¡rio real nos cards de carteira (via `quote_snapshots`)
- **Status**: PENDENTE â€” **transferida para o prÃ³ximo ciclo** (humano pediu encerramento do processo em 2026-07-24; ciclo 3 termina com a Onda A. Primeira candidata da fila do ciclo 4; depende de T-014/T-015 por tocar `services/portfolio.ts` e tipos compartilhados)
- **Prioridade**: P2
- **Depende de**: T-014, T-015
- **Branch/worktree**: â€”
- **Contexto**: limitaÃ§Ã£o encontrada na T-012: os cards de carteira mostram P&L total rotulado, porque nÃ£o hÃ¡ fechamento do dia anterior no modelo. Os `quote_snapshots` diÃ¡rios existem e permitem derivar.
- **Escopo**: server calcula, por carteira, o valor da posiÃ§Ã£o ao fechamento anterior usando o Ãºltimo `quote_snapshot` de cada ticker antes de hoje (tickers sem snapshot â†’ P&L diÃ¡rio indisponÃ­vel para a carteira, sinalizar); expor no `PortfolioSummary` (ex.: `dayProfitLoss`, `dayProfitLossPct`, nullable) com teste de cÃ¡lculo; `WalletSelector` troca o chip "total" pelo P&L do dia quando disponÃ­vel (mantÃ©m fallback "total" rotulado quando nÃ£o).
- **Fora de escopo**: backfill de snapshots; mudanÃ§as no job de captura.
- **CritÃ©rio de aceite**: teste com snapshots conhecidos â†’ P&L diÃ¡rio bate com cÃ¡lculo manual; sem snapshot â†’ campo null e chip cai no fallback; suÃ­te verde.
- **Resultado**: â€”

## Ciclo 2 â€” CONCLUÃDO E MERGEADO (2026-07-24)

> **Refactor "Vetor Wallet v4" (handoff `design_handoff_vetor_wallet_refactor/`)** â€” 11 tarefas (T-003 a T-013), todas revisadas, aprovadas e mergeadas via PRs #47â€“#56. Sanidade final na `main`: 128 testes verdes (14 arquivos) + build completo. Detalhes por tarefa abaixo (status atualizado em cada bloco).
> Pedido direto do humano (2026-07-24): elevar o app de "carteira de aÃ§Ãµes" para carteira financeira completa em **layers**: Renda mensal, Despesas fixas, PoupanÃ§a/Reserva, Metas, Criptomoedas (mock "em breve") e AÃ§Ãµes (existente). Visual novo estilo biip.club (neutro, light/dark, fonte Geist, mascotes por layer). Fonte de verdade do design: `design_handoff_vetor_wallet_refactor/README.md` + protÃ³tipo `Vetor Wallet v4.dc.html` (referÃªncia visual, NÃƒO copiar cÃ³digo).
>
> **CorreÃ§Ã£o ao handoff**: ele afirma que os modelos de renda/despesas/poupanÃ§a/metas "jÃ¡ existem no server" â€” **nÃ£o existem**. T-006/T-007 criam esse backend.
>
> **Ondas de paralelismo**: Onda A = T-003, T-004, T-006 (independentes entre si). Onda B = T-005, T-007. Onda C = T-008â€¦T-013 (dependem da shell T-004 e dos backends; ver "Depende de" de cada uma).

### T-008 â€” Home v4 (`/home`): hero de patrimÃ´nio + grid de cards de layers com mascote no hover
- **Status**: CONCLUIDA e MERGEADA â€” PR [#56](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/56). HistÃ³rico: REPROVADA na 1Âª revisÃ£o (lÃ³gica de cÃ¡lculo em `homeMetrics.ts` sem teste â€” CLAUDE.md exige e prescreve testar funÃ§Ãµes puras do web via Vitest do server); executor corrigiu (10 testes em `server/src/services/homeMetrics.test.ts`, `Promise.allSettled` por card, `exclude` de testes no build de produÃ§Ã£o do server) â†’ APROVADA na re-revisÃ£o. SuÃ­te foi a 128 testes.
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-006, T-007
- **Branch/worktree**: â€”
- **Contexto**: handoff, tela 2 â€” porta de entrada do app multi-layer. **AtualizaÃ§Ã£o 2026-07-24**: a T-004 jÃ¡ entregou `web/src/routes/HomePage.tsx` com hero (dados de aÃ§Ãµes) e grid de cards com hover de mascote, aprovada pelo revisor â€” esta tarefa deve **evoluir esse arquivo** (integrar dados de renda/despesas/poupanÃ§a das T-006/T-007 no hero e nos cards), nÃ£o recriar.
- **Escopo**: hero com "PatrimÃ´nio total" 30px (soma: valor atual das aÃ§Ãµes via `/api/portfolio` + saldo de poupanÃ§a; cotaÃ§Ã£o nula â†’ usar investido como fallback e sinalizar) + Renda / Despesas / Sobra do mÃªs (renda âˆ’ despesas) 20px com labels. Grid `repeat(auto-fit, minmax(300px,1fr))` gap 16px com 6 cards: Renda mensal, Despesas, PoupanÃ§a, AÃ§Ãµes, Criptomoedas (chip "em breve", valor "â€”"), Metas â€” nome 15px, descriÃ§Ã£o 12px dim, valor 22px tabular, chip pill de status, clique navega. Mascote oculto que sobe no hover: `right:14px; bottom:-16px; height:128px`, `opacity .3s ease` + `transform .35s cubic-bezier(.2,.9,.3,1.3)` de `translateY(14px) rotate(4deg)` a `translateY(0) rotate(0)`; card `position:relative; overflow:hidden`. FormataÃ§Ã£o pt-BR/BRL.
- **Fora de escopo**: telas dos layers; endpoint agregado novo no server (agregaÃ§Ã£o no front nesta fase).
- **CritÃ©rio de aceite**: com dados criados via API nos 4 novos layers + uma carteira de aÃ§Ãµes, hero e cards exibem valores corretos (conferÃ­veis manualmente); hover revela mascote com a animaÃ§Ã£o; clique em cada card navega ao layer; build web ok. Se a agregaÃ§Ã£o do patrimÃ´nio virar funÃ§Ã£o pura nÃ£o trivial, extraÃ­-la e apontar onde serÃ¡ testada quando o runner do web existir (issue #6).
- **Resultado**: â€”

### T-009 â€” Telas dos layers Renda (`/renda`) e Despesas (`/despesas`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#54](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/54) (APROVADA pelo revisor, 0 bloqueantes; executor fez smoke test real contra o server dev; orquestrador resolveu conflito de rotas do `App.tsx` com a T-010 e removeu `LayerPlaceholderPage` Ã³rfÃ£o)
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-006
- **Branch/worktree**: `giovane/t-009-telas-renda-despesas`
- **Contexto**: handoff, tela 3. ConteÃºdo enxuto, alto nÃ­vel, sem grÃ¡ficos pesados.
- **Escopo**: **Renda**: total do mÃªs + lista de fontes (nome, tipo, valor) + form de adiÃ§Ã£o + excluir. **Despesas**: total + lista por categoria (sem barras de progresso) + form + excluir. Componentes novos em `web/src/components/` consumindo as funÃ§Ãµes de `api.ts` da T-006; header com mascote e tÃ­tulo/subtÃ­tulo do layer (via shell T-004); formataÃ§Ã£o pt-BR/BRL; estados vazio/carregando/erro.
- **Fora de escopo**: ediÃ§Ã£o inline; recorrÃªncia; grÃ¡ficos.
- **CritÃ©rio de aceite**: criar/listar/excluir fontes de renda e despesas funciona ponta a ponta contra o server; totais batem com a soma dos itens; layout confere com protÃ³tipo em desktop e 360px; build web ok. Justificativa de teste: UI sobre API jÃ¡ testada na T-006; web sem runner.
- **Resultado**: â€”

### T-010 â€” Telas dos layers PoupanÃ§a (`/poupanca`) e Metas (`/metas`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#53](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/53) (APROVADA pelo revisor, 0 bloqueantes: summary direto do server, clamp de 100% na barra de metas, decimais pt-BR, erros 400 exibidos)
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-007
- **Branch/worktree**: `giovane/t-010-telas-poupanca-metas`
- **Contexto**: handoff, tela 3.
- **Escopo**: **PoupanÃ§a**: saldo, aportes, rendimento (derivados dos lanÃ§amentos da T-007) + form de lanÃ§amento + dica CDI em card de texto simples. **Metas**: lista de metas com nome, alvo, atual, % em barra fina + form de criaÃ§Ã£o + atualizaÃ§Ã£o de progresso (PATCH) + excluir. Mesmos padrÃµes da T-009.
- **Fora de escopo**: cÃ¡lculo automÃ¡tico de rendimento; grÃ¡ficos.
- **CritÃ©rio de aceite**: fluxos ponta a ponta funcionam contra o server; % da meta = atual/alvo correto e limitado a 100% na barra; layout ok em desktop e 360px; build web ok. Justificativa de teste: UI sobre API testada na T-007.
- **Resultado**: â€”

### T-011 â€” Tela Cripto mock (`/cripto`) "em breve"
- **Status**: CONCLUIDA â€” satisfeita pela T-004 (PR #48): `CriptoPage.tsx` com mascote 130px, "Estamos trabalhando nisso", texto dim e botÃ£o fantasma de volta, conferida pelo revisor da T-004 como fiel ao handoff. Sem PR prÃ³pria.
- **Prioridade**: P2
- **Depende de**: T-003, T-004
- **Branch/worktree**: â€”
- **Contexto**: handoff, tela 3 (Cripto) â€” sem backend, tela estÃ¡tica.
- **Escopo**: card centralizado com mascote cripto 130px, tÃ­tulo "Estamos trabalhando nisso" 20px, texto explicativo dim e botÃ£o fantasma "Voltar ao inÃ­cio" (â†’ `/home`). Chip "em breve" no card da home jÃ¡ coberto na T-008.
- **Fora de escopo**: qualquer funcionalidade/backend de cripto.
- **CritÃ©rio de aceite**: tela renderiza conforme protÃ³tipo nos dois temas; botÃ£o volta Ã  home; build web ok. Justificativa de teste: tela estÃ¡tica.
- **Resultado**: â€”

### T-012 â€” Carteiras de aÃ§Ãµes v4 (`/carteiras`): cards estilo cartÃ£o de crÃ©dito
- **Status**: CONCLUIDA e MERGEADA â€” PR [#52](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/52) (APROVADA; grosso do escopo jÃ¡ vinha da T-004 â€” este diff unificou o Ãºltimo toggle de tema inline no `ThemeToggleButton` e rotulou o chip de P&L como "total" com tooltip, pois P&L diÃ¡rio nÃ£o Ã© derivÃ¡vel do modelo atual. Candidata a tarefa futura: P&L diÃ¡rio via `quote_snapshots`)
- **Prioridade**: P1
- **Depende de**: T-003, T-004
- **Branch/worktree**: `giovane/t-012-carteiras-v4`
- **Contexto**: handoff, tela 4. Evolui o `WalletSelector.tsx` atual para uma pÃ¡gina prÃ³pria.
- **Escopo**: pÃ¡gina com cards radius 20px, gradiente sutil "leather", nome da carteira, valor total e P&L do dia (dados de `/api/wallets` + `/api/portfolio`); card fantasma "+ Nova carteira" abrindo o fluxo de criaÃ§Ã£o existente; clique no card â†’ `/dash/:id`.
- **Fora de escopo**: editar/excluir carteira (se nÃ£o existir hoje); mudanÃ§as no backend de wallets.
- **CritÃ©rio de aceite**: carteiras existentes aparecem com valores corretos; criar carteira funciona; navegaÃ§Ã£o para o dashboard da carteira funciona; layout ok em 360px; build web ok. Justificativa de teste: UI sobre APIs existentes.
- **Resultado**: â€”

### T-013 â€” Dashboard da carteira v4 (`/dash/:id`): stats, tabela de 7 colunas, form de operaÃ§Ã£o â€” sem grÃ¡ficos
- **Status**: CONCLUIDA e MERGEADA â€” PR [#55](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/55) (APROVADA, 0 bloqueantes: tabela de exatamente 7 colunas conferida, grÃ¡ficos e BenchmarkComparison fora do render com arquivos/rotas do server intactos, segmented pill acessÃ­vel, CsvImport/AlertsPanel preservados)
- **Prioridade**: P1
- **Depende de**: T-003, T-004
- **Branch/worktree**: `giovane/t-013-dashboard-v4`
- **Contexto**: handoff, tela 5. Evoluir `PortfolioDashboard.tsx`/`OperationForm.tsx`/`OperationsList.tsx` â€” o design **remove** os grÃ¡ficos de evoluÃ§Ã£o/alocaÃ§Ã£o/comparativo.
- **Escopo**: 3 cards de stats (Valor atual, Investido, Resultado com chip %); tabela de posiÃ§Ãµes com exatamente 7 colunas (Ticker, Qtd, PM, CotaÃ§Ã£o, Valor atual, Resultado, %), linhas 13px padding 13/22px hover `rgba(raised,.55)`, sem linha expansÃ­vel; form de operaÃ§Ã£o em card (ticker, qtd, preÃ§o, data, segmented compra/venda) mantendo `TickerCombobox`; remover do render os grÃ¡ficos e o `BenchmarkComparison` (manter arquivos/rotas do server intactos â€” sÃ³ sai da UI); cores up/down no P&L; tabular-nums.
- **Fora de escopo**: mudanÃ§as em `portfolio.ts` do server; validaÃ§Ã£o de SELL (dÃ­vida conhecida, fora deste ciclo); alertas e import CSV (manter acessÃ­veis onde estÃ£o ou registrar no `TODO-HUMANO.md` se o design nÃ£o prevÃª lugar para eles).
- **CritÃ©rio de aceite**: registrar compra/venda atualiza a tabela; valores idÃªnticos aos do dashboard atual para a mesma carteira (sem regressÃ£o de cÃ¡lculo); tabela com scroll prÃ³prio em 360px sem overflow da pÃ¡gina; build web ok. Justificativa de teste: UI sobre serviÃ§os jÃ¡ testados (`portfolio.test.ts`); nenhum cÃ¡lculo novo no front.
- **Resultado**: â€”

## ConcluÃ­das

> AutorizaÃ§Ã£o permanente do humano (2026-07-24, via chat): orquestrador abre as PRs e faz o merge automÃ¡tico (resolvendo conflitos); revisÃ£o humana passa a ser a posteriori sobre as PRs.

### T-007 â€” Backend: layers PoupanÃ§a/Reserva e Metas (schema + rotas + tipos + testes)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#51](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/51) (2026-07-24)
- **Branch**: `giovane/t-007-backend-poupanca-metas`
- **Resultado**: tabelas `savings_entries` (livro DEPOSIT/WITHDRAW/YIELD, saldo derivado) e `goals`; rotas `/api/savings` (GET com summary calculado no server: balance/totalDeposits/totalYield/totalWithdrawals), `/api/goals` (PATCH parcial); 7 tipos em `shared/`, 7 funÃ§Ãµes fetch em `api.ts`, `CLAUDE.md` atualizado. 26 testes novos (goals 15, savings 11); suÃ­te 13 arquivos / 118 testes verde; build ok. Revisor: APROVADA, 0 bloqueantes ("zero regressÃµes, zero desvio de escopo"). Ressalva futura: teste explÃ­cito de summary para usuÃ¡rio sem lanÃ§amentos.

### T-005 â€” Landing + Login v4 (`/`)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#50](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/50) (2026-07-24; inclui commit `d1dd385` do orquestrador corrigindo comentÃ¡rio do `ThemeToggleButton`, ressalva do revisor)
- **Branch**: `giovane/t-005-landing-login-v4`
- **Resultado**: `AuthPage.tsx` reescrita no layout do handoff (grid 1.5fr/1fr, card de apresentaÃ§Ã£o com mascotes + card de login, rodapÃ© brapi.dev) usando os primitivos das T-003/T-004; toggle de tema unificado no `ThemeToggleButton`; estilos em `App.css` (`.vw-landing-*`), `index.css` e backend intocados. Fluxo de auth preservado. Revisor: APROVADA, 0 bloqueantes â€” fidelidade conferida linha a linha; mascotes verificados via dev server (HTTP 200). Ressalva em aberto: **validaÃ§Ã£o visual humana em 360/860px** (revisor validou por CSS/HTTP, sem screenshot). PendÃªncia para T-012: toggle inline do `WalletSelector` ainda a unificar.

### T-006 â€” Backend: layers Renda mensal e Despesas fixas (schema + rotas + tipos + testes)
- **Status**: CONCLUIDA e MERGEADA â€” PR [#49](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/49) (2026-07-24)
- **Prioridade**: P1
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-006-backend-renda-despesas`
- **Contexto**: primeiros backends dos novos layers (ciclo 2); modelagem por `user_id` sem vÃ­nculo com wallet (default do orquestrador, informativo no `TODO-HUMANO.md`).
- **Escopo**: tabelas `income_sources` e `fixed_expenses`; rotas `GET/POST/DELETE /api/income` e `/api/expenses` com `requireAuth`; tipos em `shared/`; funÃ§Ãµes fetch em `web/src/api.ts`; `CLAUDE.md` atualizado.
- **CritÃ©rio de aceite**: (cumprido) 18 testes novos cobrindo criaÃ§Ã£o, listagem isolada por usuÃ¡rio, exclusÃ£o, 404 cross-user, 401 e 400s; suÃ­te inteira verde (11 arquivos, 92 testes); `pnpm build` completo sem erro.
- **Resultado**: 9 arquivos tocados (`db.ts`, `routes/income.ts`+teste, `routes/expenses.ts`+teste, `index.ts`, `shared/src/index.ts`, `web/src/api.ts`, `CLAUDE.md`). Revisor: APROVADA, zero bloqueantes â€” verificou isolamento rigoroso (`user_id` sÃ³ de `res.locals`, DELETE cross-user retorna 404 sem vazar existÃªncia, SQL 100% parametrizado), validaÃ§Ã£o completa de input e docs fiÃ©is. Ressalva nÃ£o bloqueante: os testes novos sÃ£o os primeiros de rota Express+DB real do repo e usam `import()` dinÃ¢mico em `beforeAll` para setar `DATABASE_URL` antes do load de `db.ts` (necessÃ¡rio por hoisting de imports; revisor confirmou soluÃ§Ã£o sÃ³lida) â€” **padrÃ£o a reutilizar na T-007** e a documentar futuramente.

### T-004 â€” Shell do app v4: rotas por layer, header sticky com logo dinÃ¢mica, animaÃ§Ã£o de entrada
- **Status**: CONCLUIDA e MERGEADA â€” PR [#48](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/48) (2026-07-24; inclui commit `f3a555d` do orquestrador reconciliando o stub de tema com o `theme.ts` da T-003)
- **Prioridade**: P1
- **Depende de**: â€” (paralela a T-003)
- **Branch/worktree**: `giovane/t-004-shell-rotas-v4` (commit `0dadf55`)
- **Contexto**: estrutura de navegaÃ§Ã£o do v4 (ciclo 2, handoff "Screens/Views").
- **Escopo**: rotas `/`, `/home`, `/renda`, `/despesas`, `/poupanca`, `/metas`, `/cripto`, `/carteiras`, `/dash/:id` com react-router v7; guards de autenticaÃ§Ã£o; header sticky com logo (mascote por rota) + saudaÃ§Ã£o + toggle de tema + sair; animaÃ§Ã£o fade+rise reutilizÃ¡vel; placeholders nas rotas de layer.
- **CritÃ©rio de aceite**: (cumprido) navegaÃ§Ã£o completa com header persistente e logo correta; redirect de rota protegida sem sessÃ£o; dashboard de aÃ§Ãµes sem regressÃ£o em `/dash/:id`; build verde. Teste dispensado (navegaÃ§Ã£o/UI, web sem runner).
- **Resultado**: `App.tsx` refatorado para roteamento; novos `layout/` (AppShell, ProtectedShell, ShellContext, mascots, LoadingScreen) e `routes/` (LandingRoute, HomePage, LayerPlaceholderPage, CriptoPage, CarteirasPage, DashboardPage, AdminRoute); `WalletSelector` ganhou modo `embedded`; `ThemeToggleButton` novo; `/admin` preservado com guard de role. Revisor: APROVADA, sem bloqueantes â€” verificou map mascoteâ†’rota exato, guards sem loop/flash, e que `DashboardPage` reproduz fielmente o fluxo antigo de refresh (operaÃ§Ãµes, CSV, alertas, benchmarks). Ressalvas: (1) stub de tema em `App.tsx:15-23,44-57` duplica o `theme.ts` da T-003 (mesma chave `vw-theme`, comportamento nÃ£o divergente) â€” **reconciliar no merge: `theme.ts` vira fonte Ãºnica**; (2) `ThemeToggleButton` coexiste com toggles antigos de `AuthPage`/`WalletSelector` â€” unificar nas T-005/T-012; (3) executor adiantou `HomePage` (T-008) e `CriptoPage` (T-011) alÃ©m do placeholder â€” enxutos e fiÃ©is ao handoff, T-008/T-011 ajustadas em funÃ§Ã£o disso.

### T-003 â€” Design tokens v4: tema light/dark neutro, fonte Geist e mascotes
- **Status**: CONCLUIDA e MERGEADA â€” PR [#47](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/47) (2026-07-24)
- **Prioridade**: P1
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-003-design-tokens-v4`
- **Contexto**: base visual do refactor v4 (ciclo 2) â€” tokens do handoff `design_handoff_vetor_wallet_refactor/README.md`.
- **Escopo**: tokens light/dark do handoff em `web/src/index.css` (@theme Tailwind v4 + custom properties), mecÃ¢nica de tema (`.light`/`.dark` no `<html>`, `localStorage['vw-theme']`, `color-scheme`), fonte Geist, tipografia/formas base, mascotes em `web/public/layers/`.
- **CritÃ©rio de aceite**: (cumprido) troca de classe no `<html>` troca o tema inteiro; persistÃªncia apÃ³s reload; mascotes servidos em `/layers/*.png`; build web verde. Teste dispensado (visual/CSS, web sem runner â€” issue #6).
- **Resultado**: Arquivos: `web/src/index.css` (reescrito â€” valores do handoff conferidos hex a hex pelo revisor, nomes de variÃ¡veis antigos preservados: nenhum componente precisou de ediÃ§Ã£o), `web/src/theme.ts` (novo â€” get/set/toggle/init), `web/src/main.tsx` (initTheme), `web/index.html` (prÃ©-paint default light, sem flash), `web/public/layers/*.png` (6 mascotes). Build + lint verdes; PNGs verificados via HTTP 200. Revisor: APROVADA, sem bloqueantes. Ressalvas nÃ£o bloqueantes: (1) o prÃ³prio handoff tem hex vs rgb divergentes para `raised`/`edge` â€” executor seguiu os hex, consistentes; (2) alias duplicado `--color-surface`/`--color-raised` herdado de antes, limpeza futura. PendÃªncia de integraÃ§Ã£o: reconciliar com o stub de tema criado pela T-004 (usar `theme.ts` como fonte Ãºnica no merge).

### T-001 â€” Aplicar paleta 60-30-10 via CSS custom properties
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovaÃ§Ã£o humana)
- **Prioridade**: P1
- **Depende de**: â€”
- **Branch/worktree**: `giovane/t-001-paleta-60-30-10` (commit `c04a925`) â€” PR [#44](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/44)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` â€” redesign visual com regra 60-30-10. A proposta de paleta vai para o `TODO-HUMANO.md` para aprovaÃ§Ã£o antes de merge.
- **Escopo**: Definir a paleta 60-30-10 (avaliar se mantÃ©m o tom areia `#e3d5b8` como base) e aplicÃ¡-la exclusivamente via CSS custom properties em `web/src/index.css`. Documentar em comentÃ¡rio no `index.css` qual cor Ã© 60, qual Ã© 30 e qual Ã© 10. Preservar cores semÃ¢nticas de lucro/prejuÃ­zo (verde/vermelho) fora da conta 60-30-10. Ajustar usos de cor hardcoded nos componentes apenas se necessÃ¡rio para que consumam as variÃ¡veis.
- **Fora de escopo**: responsividade/media queries (T-002); framework CSS novo; mudanÃ§as de layout ou markup alÃ©m de troca de cor.
- **CritÃ©rio de aceite**: todas as cores de tema saem de custom properties em `index.css`; comentÃ¡rio documenta o papel 60/30/10 de cada cor; verde/vermelho de P&L intactos; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudanÃ§a puramente visual (CSS) â€” polÃ­tica do CLAUDE.md dispensa teste novo.
- **Resultado**: O tema existente jÃ¡ seguia a proporÃ§Ã£o 60-30-10; o executor manteve todos os valores de cor e documentou os papÃ©is em comentÃ¡rio (`index.css`, Ãºnico arquivo alterado). Paleta: 60% canvas `#0f0e0b` dark / `#f4efe5` light; 30% cards/superfÃ­cies/bordas; 10% destaque areia `#e3d5b8` dark / `#a8814f` light (mantido por ser identidade da marca). P&L verde/vermelho fora da conta, intactos. Build ok. Revisor: APROVADA, com ressalva de que isso cumpre o critÃ©rio literal da tarefa mas nÃ£o constitui o "redesign" da prioridade 1 â€” decisÃ£o registrada no `TODO-HUMANO.md`.

### T-002 â€” Responsividade mobile (viewport â‰¥360px) em todas as telas
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovaÃ§Ã£o humana)
- **Prioridade**: P1
- **Depende de**: â€” (paralela a T-001; toca `App.css` e componentes, nÃ£o `index.css`)
- **Branch/worktree**: `giovane/t-002-responsividade-mobile` (commit `7b4b807`) â€” PR [#45](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/45)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` â€” todas as telas usÃ¡veis em mobile.
- **Escopo**: Tornar dashboard, operaÃ§Ãµes, auth e admin usÃ¡veis em viewport â‰¥360px: tabelas com scroll horizontal prÃ³prio ou layout empilhado, formulÃ¡rios em coluna Ãºnica, grÃ¡ficos redimensionando. Media queries e ajustes de layout em `web/src/App.css` e nos componentes (`PortfolioDashboard.tsx`, `OperationsList.tsx`, `OperationForm.tsx`, `AuthPage.tsx`, `AdminPage.tsx` etc.). NÃƒO editar `web/src/index.css` (reservado Ã  T-001).
- **Fora de escopo**: troca de paleta/cores (T-001); framework CSS novo; mudanÃ§a de funcionalidade.
- **CritÃ©rio de aceite**: telas legÃ­veis e operÃ¡veis em 360px, 768px e desktop sem overflow horizontal da pÃ¡gina; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudanÃ§a de estilo/layout â€” polÃ­tica do CLAUDE.md dispensa teste novo; web ainda sem runner (issue #6).
- **Resultado**: 8 arquivos alterados: `App.css` (antes Ã³rfÃ£o, agora importado em `main.tsx`) com safety-net `overflow-x: hidden` global e media query do WalletSelector; formulÃ¡rios (`OperationForm`, `AlertsPanel`) em coluna Ãºnica no mobile; chip da carteira ativa truncado no header (`App.tsx`); `AdminPage` empilha data+botÃ£o; `CsvImport` com `flex-wrap`. Tabelas do dashboard/operaÃ§Ãµes jÃ¡ rolavam em container prÃ³prio (verificado pelo revisor). `index.css` intocado (sem conflito com T-001). Build ok. Revisor: APROVADA; risco remanescente: `overflow-x: hidden` global pode mascarar overflow futuro â€” recomendado teste manual em navegador (360/768px) antes do merge.

## Ciclo 7 — Feedback do humano pós-ciclo 6 — CONCLUÍDO E MERGEADO (2026-07-25)

> Feedback do humano após validar os ciclos 5–6. 3 tarefas em 1 onda paralela (arquivos disjuntos), PRs #77–#79. Sanidade final na main: server 370 testes (26 arquivos) + web 122 (11 arquivos) + build verdes. Arrumação de repo/docs feita pelo orquestrador antes da onda: BACKLOG-ARQUIVO.md criado, ORQUESTRADOR.md reescrito, prd-writer/prd-tailwind removidos (commit 938f17b).

### T-036 — Renda variável com visão mensal — PR #79. Executor Opus, revisor Opus: APROVADA, 0 bloqueantes. Tabela income_entries + rotas GET/POST/PATCH/DELETE espelhando expense-entries/T-031 (28 testes); RendaPage com navegação mensal e edição inline; Home: sobra real = (renda fixa + rendas variáveis) − despesas fixas − variáveis, sobra prevista inalterada, degradação independente por fonte. Sugestões: rótulo "Estimativa" impreciso quando só rendas falham (valor parcial correto); comentário herdado da T-025; defaultEntryDate triplicado; substr não-sargável por simetria.

### T-037 — Ocultar "Orçamento do mês" — PR #78. Executor Sonnet, revisor Sonnet: APROVADA, 0 bloqueantes. Seção removida da DespesasPage (JSX conferido na íntegra), backend/testes de budgets preservados (reversível). Feedback: humano não viu utilidade no recurso da T-023.

### T-038 — Logo do header clicável → /home — PR #77. Executor Sonnet, revisor Sonnet: APROVADA, 0 bloqueantes. Link SPA com aria-label, visual preservado nos dois temas.

## Ciclo 8 — Pedidos do humano pré-"próxima onda" — CONCLUÍDO E MERGEADO (2026-07-25)

Suíte ao fim: 411 server + 171 web. Onda A (T-039/T-040/T-042 em paralelo + spike Plan/Opus da T-041) e Onda B (T-041, dependente da T-040 por tocar PoupancaPage.tsx).

### T-039 — Landing: incluir Despesas nas explicações dos layers — PR #80. Executor Haiku, revisor Sonnet: APROVADA, 0 bloqueantes. Item "Renda e despesas" do FEATURES da AuthPage separado em "Renda" (receitas-t.png) e "Despesas" (despesas-t.png). Sem teste novo (copy).

### T-040 — Poupança: simulador de previsão de rendimento — PR #82. Executor Opus, revisor Opus: APROVADA, 0 bloqueantes, 4 sugestões (1 aplicada inline: redação da invariante de centavos; 3 em Candidatas). Card client-side em /poupanca: projectSavings (juros compostos, centavos, null p/ inválido) + deriveMonthlyRatePct (média das taxas mensais YIELD/saldo-início-do-mês, 6 meses); defaults do summary/histórico sem sobrescrever digitação (simTouched); 23 testes.

### T-041 — Poupança: transferir saldo para uma meta — PR #83. Spike Plan/Opus + executor Opus + revisor Opus: APROVADA, 0 bloqueantes, 5 sugestões em Candidatas. POST /api/savings/transfer-to-goal: par atômico (db.batch) WITHDRAW sem vínculo + DEPOSIT vinculado, transfer_group UUID (ALTER idempotente); validação contra saldo livre (saldo − Σ max(0, net por meta), centavos); SavingsSummary intocado; UI: 4º card "Saldo livre", card de transferência, selo ⇄, aviso meta MANUAL, link em /metas com ?meta=. +41 testes server, +26 web.

### T-042 — Renda: renomear labels das seções mensais — PR #81. Executor Haiku, revisor Sonnet: APROVADA, 0 bloqueantes. "Fontes fixas" → "Renda fixa do mês", "Rendas do mês" → "Renda variável do mês", subtitle/JSDoc/hint coerentes. Sem teste novo (copy).

## Ciclo 9 — Colheita das revisões + endurecimento + carteira única — CONCLUÍDO E MERGEADO (2026-07-25)

PRs #84–#92. Suíte ao fim: 460 server + 177 web. Ondas: 1 (T-044/T-046/T-047 paralelas) → 2 (T-048/T-049) → 3 (T-045) → 4 (T-043) → 5 (T-050a/T-050b, pedido do humano "faça isso depois").

### T-044 — `AND user_id` no UPDATE final de todos os PATCH — PR #85. Executor Sonnet, revisor Opus: APROVADA, 0 bloqueantes (teste de mutação confirmou a ordem dos parâmetros). 6 rotas; `recurringExpenses.ts` já filtrava. Sugestões em Candidatas (spy de `db.execute`; re-SELECT final sem `AND user_id`).

### T-046 — Robustez de sessões — PR #86. Executor Sonnet, revisor Opus: APROVADA, 0 bloqueantes. `cleanupExpiredSessions` extraída/testada; fail-closed p/ `expires_at` corrompido; `maxAge <= 0` expira imediatamente. CLAUDE.md anotado na integração. +4 testes.

### T-047 — Refinos do simulador (colheita T-040) — PR #84. Executor Sonnet, revisor Sonnet: APROVADA, 0 bloqueantes. Curto-circuito `initial === 0`; `formatDecimalInput` (vírgula, 2/4 casas); mês corrente fora da amostra de `deriveMonthlyRatePct`. +6 testes.

### T-048 — Refinos da transferência (colheita T-041) — PR #87. Executor Sonnet, revisor Opus: APROVADA, 0 bloqueantes. `validateTransfer` devolve o parseado; 201 tipado com `SavingsTransferResult`; `buildSummary` em centavos (mesma aritmética de `computeBalance`); `isoDaysAgo` local; CLAUDE.md formato. Sugestões em Candidatas.

### T-049 — Higiene do fetch mensal + `endMonth` — PR #88. Executor Sonnet, revisor Opus: REPROVADA 1ª rodada (CLAUDE.md contraditório na seção T-035 + lacuna de teste positivo), corrigida, APROVADA. `MonthFetchGuard` (dedupe); fim do flicker do histórico; `/summary?endMonth=` ancorado no fuso do cliente com teto de horizonte por mês da janela. +6 server, +6 web.

### T-045 — POST recorrente transacional + `isUniqueViolation` — PR #89. Executor Sonnet, revisor Opus: APROVADA, 0 bloqueantes (verificou o driver libsql). `createRecurringExpenseEntry` com `db.transaction('write')` interativa (batch não expõe lastInsertRowid intermediário); rollback via `finally { tx.close() }`; `markMonthMaterialized` (dead code perigoso) removida nos acabamentos. +9 testes.

### T-043 — Validação de data real em todas as rotas — PR #90. Executor Sonnet, revisor Opus: APROVADA, 0 bloqueantes (helper validado em 2 fusos extremos, incl. regra secular do bissexto). `isValidIsoDate` (`services/dates.ts`) em operations/income-entries/expense-entries/savings/transfer-to-goal/import(por linha)/admin. +18 testes.

### T-050 (spike) — Plan/Opus: modelo "escopo = usuário, carteira vira rótulo"; corte em T-050a/T-050b; pergunta do P&L consolidado p/ legado registrada no TODO-HUMANO (default adotado).

### T-050a — Server: invariante de carteira única — PR #91. Executor Opus, revisor Opus: APROVADA, 0 bloqueantes (varredura de `wallet_id` residual zerada). `services/wallets.ts` (`getOrCreateDefaultWallet`, sem UNIQUE por causa do legado); `POST /api/wallets` → 400 com carteira existente; `DELETE` removido; `walletId` ignorado nas 3 rotas de dados (fecha buraco de posse do `wallet_id` do body); SELL contra o consolidado; `createUser` cria a padrão; canário da T-019 convertido. +11 testes.

### T-050b — Web: fluxo de carteira única — PR #92. Executor Opus, revisor Opus: APROVADA, 0 bloqueantes (traçou os 4 caminhos do auto-create; zero referências mortas). `api.ts` sem `walletId`; `walletFlow` reescrito (invariante T-027 estrutural) + `resolvePrimaryWallet`; `ShellContext`/`App` singulares; `/dash` com redirects de `/dash/:id` e `/carteiras`; removidos `CarteirasPage`/`WalletSelector`/`walletChip(+test)` (divergência consciente do precedente T-026). Suíte web 183 → 177.
