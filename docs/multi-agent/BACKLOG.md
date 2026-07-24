# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Modelo de tarefa

```markdown
### T-001 — Título curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Depende de**: — (ou T-xxx; tarefas com dependência não paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe; link para prioridade no ORQUESTRADOR.md
- **Escopo**: o que fazer, arquivos-alvo prováveis
- **Fora de escopo**: o que NÃO fazer
- **Critério de aceite**: verificável — "dado X, quando Y, então Z" + comando de teste
- **Resultado**: (preenchido ao concluir: resumo, arquivos, testes rodados)
```

---

## Tarefas ativas

_(vazio — ciclo 3 concluído e processo encerrado pelo humano em 2026-07-24. Próximo ciclo: começar pela "Fila do ciclo 4" abaixo.)_

## Fila do ciclo 4 (registrada no encerramento — PENDENTE, não delegada)

### T-016 — P&L diário real nos cards de carteira (via `quote_snapshots`)
_(item completo mais abaixo, na seção do ciclo 3 — transferido; primeira da fila)_

### T-019 — Validar SELL do import CSV por `wallet_id`
- **Status**: PENDENTE
- **Prioridade**: P1 (lacuna de corretude encontrada pelo revisor da T-014)
- **Contexto**: `server/src/routes/import.ts` valida SELL contra a posição somada de TODAS as carteiras do usuário (a query não filtra por `wallet_id`, ao contrário de `operations.ts`). Usuário com múltiplas carteiras pode importar um SELL que excede a posição da carteira alvo sem rejeição.
- **Escopo**: filtrar a query de posição do import por `wallet_id` quando informado; teste de rota cobrindo o cenário multi-carteira; revisar o texto correspondente no `CLAUDE.md`.
- **Critério de aceite**: CSV com SELL que excede a posição da carteira alvo (mas coberto pela soma das carteiras) é rejeitado por linha; suíte verde.

### T-020 — Logo oficial no header e na AuthPage (residual da antiga prioridade 4)
- **Status**: PENDENTE
- **Prioridade**: P3
- **Contexto**: a T-018 entregou favicon/head com a `logo-vetor-wallet.png`; falta decidir/exibir a logo oficial junto ao wordmark nas telas (hoje o header usa os mascotes por layer, decisão do design v4 — pode ser que a logo oficial fique só na landing/auth). **Decisão de UX pendente do humano**: mascotes vs logo oficial no header.
- **Escopo**: conforme decisão do humano no `TODO-HUMANO.md`.

### T-021 — Validação de SELL por data histórica (avaliar)
- **Status**: PENDENTE (avaliar se vale o custo)
- **Prioridade**: P3
- **Contexto**: ressalva do revisor da T-014: a validação atual usa a posição consolidada ATUAL; um SELL retroativo pode criar histórico com posição negativa em datas intermediárias (documentado como decisão consciente no `CLAUDE.md`).
- **Escopo**: validar a posição na data da operação (e nas datas seguintes). Custo/benefício a decidir.

### Outras candidatas (do `TODO-HUMANO.md`, aguardando ordenação do humano)
- Ampliar `/admin` (antiga prioridade 3 do `ORQUESTRADOR.md`).
- Backend de criptomoedas (tela é mock).
- Sessões persistentes (MemoryStore → store real) e agendador do job de insights (Lambda/EventBridge) — dívidas de produção conhecidas.

## Ciclo 3 — CONCLUÍDO E MERGEADO (2026-07-24)

> **Robustez e dívidas técnicas** — 4 tarefas executadas (T-014, T-015, T-017, T-018), todas revisadas, aprovadas e mergeadas via PRs #57–#60; T-016 transferida para o ciclo 4 (humano pediu encerramento). Sanidade final na `main`: server 132 testes (15 arquivos) + web 13 testes (2 arquivos) + build completo verdes; porta 3001 livre.
> Incidente resolvido no início do ciclo: server "quebrando" era processo órfão de smoke test segurando a porta 3001 (`EADDRINUSE`) — morto; regra operacional adicionada aos prompts de executor (encerrar servidores dev e confirmar porta livre).
> Humano validou o app v4 ("deu bom"). Incidente diagnosticado e resolvido pelo orquestrador antes do ciclo: server "quebrando" era processo órfão de smoke test (worktree da T-009) segurando a porta 3001 → `EADDRINUSE`; processo morto, server da `main` sobe limpo. Lição operacional: executores NÃO devem deixar servidores dev rodando ao terminar.
> Ondas: A = T-014, T-015, T-017, T-018 (independentes). B = T-016 (toca `portfolio.ts`/tipos como T-014/T-015 — em série).

### T-014 — Rejeitar venda maior que a posição (validação de SELL)
- **Status**: CONCLUIDA e MERGEADA — PR [#57](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/57). Descoberta confirmada pelo revisor via git log: a validação JÁ EXISTIA (`wouldExceedPosition`, desde `7e93d66`) e a dívida do CLAUDE.md estava desatualizada; o diff entrega 8 testes de rota (operations 5, import 3) + doc corrigida. Lacuna pré-existente achada pelo revisor → **T-019** na fila do ciclo 4 (CSV não filtra por wallet_id); semântica temporal → **T-021**.
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-014-validacao-sell`
- **Contexto**: dívida conhecida do `CLAUDE.md`/`ORQUESTRADOR.md`: `portfolio.ts` usa `Math.max(0, newQty)` — vender mais do que se possui trunca silenciosamente para zero em vez de rejeitar.
- **Escopo**: em `POST /api/operations` (e no import CSV, se aplicável), validar no server: para SELL, a quantidade vendida não pode exceder a posição do ticker na carteira/usuário na data considerada (usar o cálculo de posição existente em `services/portfolio.ts`); exceder → 400 com mensagem clara. Remover/ajustar o truncamento `Math.max(0, newQty)` conforme fizer sentido após a validação. Exibir o erro no form do front (o `OperationForm` já mostra erros da API). Atualizar "Pontos de atenção" do `CLAUDE.md` (remover a dívida).
- **Fora de escopo**: short selling; edição de operações; UI além de exibir o erro existente.
- **Critério de aceite**: testes de rota: SELL válido passa; SELL > posição retorna 400 e não grava; SELL igual à posição zera; CSV com SELL inválido rejeita a linha ou o arquivo com mensagem (documentar a escolha); suíte inteira verde.
- **Resultado**: —

### T-015 — Sinalizar falha de cotações em vez de falhar silenciosamente
- **Status**: CONCLUIDA e MERGEADA — PR [#59](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/59) (APROVADA, 0 bloqueantes: `fetchQuotes` → `{quotes, failed}`, `PortfolioSummary.quotesUnavailable?` opcional, banner warn no dashboard com fallback antigo preservado, benchmarks ajustado; 9 testes novos)
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-015-sinal-falha-cotacoes`
- **Contexto**: dívida conhecida: `fetchQuotes` retorna `Map` vazio em qualquer erro de rede/API; a UI mostra `null` sem avisar.
- **Escopo**: `services/quotes.ts` distingue "sem cotação para o ticker" de "falha na busca" (ex.: retorno `{ quotes, failed: boolean|tickersFalhos }`); `GET /api/portfolio` propaga um campo `quotesUnavailable`/equivalente no `PortfolioSummary` (tipo em `shared/`); front (dashboard e home) exibe aviso discreto quando cotações indisponíveis (a home já tem a flag `*` de fallback — integrar). Testes: mock de falha da brapi → summary com flag; mock ok → sem flag.
- **Fora de escopo**: retry/cache de cotações; mudanças no layout além do aviso.
- **Critério de aceite**: com brapi inacessível (mock), `GET /api/portfolio` responde 200 com flag e o dashboard mostra o aviso; suíte inteira verde; `CLAUDE.md` "Pontos de atenção" atualizado.
- **Resultado**: —

### T-017 — Test runner no web (issue #6)
- **Status**: CONCLUIDA e MERGEADA — PR [#58](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/58) (APROVADA: Vitest no web, 10 testes de homeMetrics migrados byte-a-byte do server, `groupByCategory` extraído com 3 testes novos; web 13 testes / server sem os migrados; CLAUDE.md atualizado — **issue #6 fechável**)
- **Prioridade**: P2
- **Depende de**: —
- **Branch/worktree**: `giovane/t-017-web-test-runner`
- **Contexto**: web nunca teve runner; o ciclo 2 contornou testando funções puras via Vitest do server (`server/src/services/homeMetrics.test.ts` importa de `web/src/`). Fechar a issue #6.
- **Escopo**: configurar Vitest no pacote `web` (script `test`, config coerente com Vite/ESM; jsdom só se necessário — começar por funções puras); migrar `homeMetrics.test.ts` do server para `web/src/routes/homeMetrics.test.ts` (e remover o `exclude` do `server/tsconfig.json` se ficar sem uso — verificar); escrever ao menos 1 teste novo de função pura existente do web para provar o setup; atualizar `CLAUDE.md` (política de testes: padrão web agora ativo) e raiz `package.json` se houver script agregador.
- **Fora de escopo**: testes de componente/E2E; cobertura ampla (vem nas próximas tarefas).
- **Critério de aceite**: `pnpm --filter vetor-wallet-web test` verde com os testes migrados+novo; `pnpm --filter vetor-wallet-server test` continua verde (nada perdido na migração); builds ok.
- **Resultado**: —

### T-018 — Favicon e identidade no `<head>` (título, meta, ícone)
- **Status**: CONCLUIDA e MERGEADA — PR [#60](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/60) (APROVADA: favicon 32px + apple-touch-icon 180px gerados da logo oficial `logo-vetor-wallet.png` — decisão fundamentada na prioridade 4 do ORQUESTRADOR.md; title/description/theme-color; pré-paint intocado; ressalva `sizes` corrigida pelo orquestrador. Residual da logo nas telas → **T-020**)
- **Prioridade**: P3
- **Depende de**: —
- **Branch/worktree**: `giovane/t-018-favicon-head`
- **Contexto**: resquício da antiga prioridade 4: o app v4 usa os mascotes como logo nas telas, mas o favicon/`<title>` do `index.html` seguem os defaults do Vite.
- **Escopo**: gerar favicon a partir do mascote `receitas-t.png` (PNG 32/180 + `apple-touch-icon`; formato simples, sem pipeline novo), `<title>` "vetor wallet", `meta description` e `theme-color` coerentes com os tokens (light/dark). Conferir se existe `logo-vetor-wallet.png` no repo e decidir entre ele e o mascote (documentar a escolha no relatório).
- **Fora de escopo**: mudanças nas telas; manifest PWA.
- **Critério de aceite**: favicon visível no dev server e no build; sem regressão no pré-paint de tema do `index.html`; build web ok. Teste dispensado (asset/HTML estático).
- **Resultado**: —

### T-016 — P&L diário real nos cards de carteira (via `quote_snapshots`)
- **Status**: PENDENTE — **transferida para o próximo ciclo** (humano pediu encerramento do processo em 2026-07-24; ciclo 3 termina com a Onda A. Primeira candidata da fila do ciclo 4; depende de T-014/T-015 por tocar `services/portfolio.ts` e tipos compartilhados)
- **Prioridade**: P2
- **Depende de**: T-014, T-015
- **Branch/worktree**: —
- **Contexto**: limitação encontrada na T-012: os cards de carteira mostram P&L total rotulado, porque não há fechamento do dia anterior no modelo. Os `quote_snapshots` diários existem e permitem derivar.
- **Escopo**: server calcula, por carteira, o valor da posição ao fechamento anterior usando o último `quote_snapshot` de cada ticker antes de hoje (tickers sem snapshot → P&L diário indisponível para a carteira, sinalizar); expor no `PortfolioSummary` (ex.: `dayProfitLoss`, `dayProfitLossPct`, nullable) com teste de cálculo; `WalletSelector` troca o chip "total" pelo P&L do dia quando disponível (mantém fallback "total" rotulado quando não).
- **Fora de escopo**: backfill de snapshots; mudanças no job de captura.
- **Critério de aceite**: teste com snapshots conhecidos → P&L diário bate com cálculo manual; sem snapshot → campo null e chip cai no fallback; suíte verde.
- **Resultado**: —

## Ciclo 2 — CONCLUÍDO E MERGEADO (2026-07-24)

> **Refactor "Vetor Wallet v4" (handoff `design_handoff_vetor_wallet_refactor/`)** — 11 tarefas (T-003 a T-013), todas revisadas, aprovadas e mergeadas via PRs #47–#56. Sanidade final na `main`: 128 testes verdes (14 arquivos) + build completo. Detalhes por tarefa abaixo (status atualizado em cada bloco).
> Pedido direto do humano (2026-07-24): elevar o app de "carteira de ações" para carteira financeira completa em **layers**: Renda mensal, Despesas fixas, Poupança/Reserva, Metas, Criptomoedas (mock "em breve") e Ações (existente). Visual novo estilo biip.club (neutro, light/dark, fonte Geist, mascotes por layer). Fonte de verdade do design: `design_handoff_vetor_wallet_refactor/README.md` + protótipo `Vetor Wallet v4.dc.html` (referência visual, NÃO copiar código).
>
> **Correção ao handoff**: ele afirma que os modelos de renda/despesas/poupança/metas "já existem no server" — **não existem**. T-006/T-007 criam esse backend.
>
> **Ondas de paralelismo**: Onda A = T-003, T-004, T-006 (independentes entre si). Onda B = T-005, T-007. Onda C = T-008…T-013 (dependem da shell T-004 e dos backends; ver "Depende de" de cada uma).

### T-008 — Home v4 (`/home`): hero de patrimônio + grid de cards de layers com mascote no hover
- **Status**: CONCLUIDA e MERGEADA — PR [#56](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/56). Histórico: REPROVADA na 1ª revisão (lógica de cálculo em `homeMetrics.ts` sem teste — CLAUDE.md exige e prescreve testar funções puras do web via Vitest do server); executor corrigiu (10 testes em `server/src/services/homeMetrics.test.ts`, `Promise.allSettled` por card, `exclude` de testes no build de produção do server) → APROVADA na re-revisão. Suíte foi a 128 testes.
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-006, T-007
- **Branch/worktree**: —
- **Contexto**: handoff, tela 2 — porta de entrada do app multi-layer. **Atualização 2026-07-24**: a T-004 já entregou `web/src/routes/HomePage.tsx` com hero (dados de ações) e grid de cards com hover de mascote, aprovada pelo revisor — esta tarefa deve **evoluir esse arquivo** (integrar dados de renda/despesas/poupança das T-006/T-007 no hero e nos cards), não recriar.
- **Escopo**: hero com "Patrimônio total" 30px (soma: valor atual das ações via `/api/portfolio` + saldo de poupança; cotação nula → usar investido como fallback e sinalizar) + Renda / Despesas / Sobra do mês (renda − despesas) 20px com labels. Grid `repeat(auto-fit, minmax(300px,1fr))` gap 16px com 6 cards: Renda mensal, Despesas, Poupança, Ações, Criptomoedas (chip "em breve", valor "—"), Metas — nome 15px, descrição 12px dim, valor 22px tabular, chip pill de status, clique navega. Mascote oculto que sobe no hover: `right:14px; bottom:-16px; height:128px`, `opacity .3s ease` + `transform .35s cubic-bezier(.2,.9,.3,1.3)` de `translateY(14px) rotate(4deg)` a `translateY(0) rotate(0)`; card `position:relative; overflow:hidden`. Formatação pt-BR/BRL.
- **Fora de escopo**: telas dos layers; endpoint agregado novo no server (agregação no front nesta fase).
- **Critério de aceite**: com dados criados via API nos 4 novos layers + uma carteira de ações, hero e cards exibem valores corretos (conferíveis manualmente); hover revela mascote com a animação; clique em cada card navega ao layer; build web ok. Se a agregação do patrimônio virar função pura não trivial, extraí-la e apontar onde será testada quando o runner do web existir (issue #6).
- **Resultado**: —

### T-009 — Telas dos layers Renda (`/renda`) e Despesas (`/despesas`)
- **Status**: CONCLUIDA e MERGEADA — PR [#54](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/54) (APROVADA pelo revisor, 0 bloqueantes; executor fez smoke test real contra o server dev; orquestrador resolveu conflito de rotas do `App.tsx` com a T-010 e removeu `LayerPlaceholderPage` órfão)
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-006
- **Branch/worktree**: `giovane/t-009-telas-renda-despesas`
- **Contexto**: handoff, tela 3. Conteúdo enxuto, alto nível, sem gráficos pesados.
- **Escopo**: **Renda**: total do mês + lista de fontes (nome, tipo, valor) + form de adição + excluir. **Despesas**: total + lista por categoria (sem barras de progresso) + form + excluir. Componentes novos em `web/src/components/` consumindo as funções de `api.ts` da T-006; header com mascote e título/subtítulo do layer (via shell T-004); formatação pt-BR/BRL; estados vazio/carregando/erro.
- **Fora de escopo**: edição inline; recorrência; gráficos.
- **Critério de aceite**: criar/listar/excluir fontes de renda e despesas funciona ponta a ponta contra o server; totais batem com a soma dos itens; layout confere com protótipo em desktop e 360px; build web ok. Justificativa de teste: UI sobre API já testada na T-006; web sem runner.
- **Resultado**: —

### T-010 — Telas dos layers Poupança (`/poupanca`) e Metas (`/metas`)
- **Status**: CONCLUIDA e MERGEADA — PR [#53](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/53) (APROVADA pelo revisor, 0 bloqueantes: summary direto do server, clamp de 100% na barra de metas, decimais pt-BR, erros 400 exibidos)
- **Prioridade**: P1
- **Depende de**: T-003, T-004, T-007
- **Branch/worktree**: `giovane/t-010-telas-poupanca-metas`
- **Contexto**: handoff, tela 3.
- **Escopo**: **Poupança**: saldo, aportes, rendimento (derivados dos lançamentos da T-007) + form de lançamento + dica CDI em card de texto simples. **Metas**: lista de metas com nome, alvo, atual, % em barra fina + form de criação + atualização de progresso (PATCH) + excluir. Mesmos padrões da T-009.
- **Fora de escopo**: cálculo automático de rendimento; gráficos.
- **Critério de aceite**: fluxos ponta a ponta funcionam contra o server; % da meta = atual/alvo correto e limitado a 100% na barra; layout ok em desktop e 360px; build web ok. Justificativa de teste: UI sobre API testada na T-007.
- **Resultado**: —

### T-011 — Tela Cripto mock (`/cripto`) "em breve"
- **Status**: CONCLUIDA — satisfeita pela T-004 (PR #48): `CriptoPage.tsx` com mascote 130px, "Estamos trabalhando nisso", texto dim e botão fantasma de volta, conferida pelo revisor da T-004 como fiel ao handoff. Sem PR própria.
- **Prioridade**: P2
- **Depende de**: T-003, T-004
- **Branch/worktree**: —
- **Contexto**: handoff, tela 3 (Cripto) — sem backend, tela estática.
- **Escopo**: card centralizado com mascote cripto 130px, título "Estamos trabalhando nisso" 20px, texto explicativo dim e botão fantasma "Voltar ao início" (→ `/home`). Chip "em breve" no card da home já coberto na T-008.
- **Fora de escopo**: qualquer funcionalidade/backend de cripto.
- **Critério de aceite**: tela renderiza conforme protótipo nos dois temas; botão volta à home; build web ok. Justificativa de teste: tela estática.
- **Resultado**: —

### T-012 — Carteiras de ações v4 (`/carteiras`): cards estilo cartão de crédito
- **Status**: CONCLUIDA e MERGEADA — PR [#52](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/52) (APROVADA; grosso do escopo já vinha da T-004 — este diff unificou o último toggle de tema inline no `ThemeToggleButton` e rotulou o chip de P&L como "total" com tooltip, pois P&L diário não é derivável do modelo atual. Candidata a tarefa futura: P&L diário via `quote_snapshots`)
- **Prioridade**: P1
- **Depende de**: T-003, T-004
- **Branch/worktree**: `giovane/t-012-carteiras-v4`
- **Contexto**: handoff, tela 4. Evolui o `WalletSelector.tsx` atual para uma página própria.
- **Escopo**: página com cards radius 20px, gradiente sutil "leather", nome da carteira, valor total e P&L do dia (dados de `/api/wallets` + `/api/portfolio`); card fantasma "+ Nova carteira" abrindo o fluxo de criação existente; clique no card → `/dash/:id`.
- **Fora de escopo**: editar/excluir carteira (se não existir hoje); mudanças no backend de wallets.
- **Critério de aceite**: carteiras existentes aparecem com valores corretos; criar carteira funciona; navegação para o dashboard da carteira funciona; layout ok em 360px; build web ok. Justificativa de teste: UI sobre APIs existentes.
- **Resultado**: —

### T-013 — Dashboard da carteira v4 (`/dash/:id`): stats, tabela de 7 colunas, form de operação — sem gráficos
- **Status**: CONCLUIDA e MERGEADA — PR [#55](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/55) (APROVADA, 0 bloqueantes: tabela de exatamente 7 colunas conferida, gráficos e BenchmarkComparison fora do render com arquivos/rotas do server intactos, segmented pill acessível, CsvImport/AlertsPanel preservados)
- **Prioridade**: P1
- **Depende de**: T-003, T-004
- **Branch/worktree**: `giovane/t-013-dashboard-v4`
- **Contexto**: handoff, tela 5. Evoluir `PortfolioDashboard.tsx`/`OperationForm.tsx`/`OperationsList.tsx` — o design **remove** os gráficos de evolução/alocação/comparativo.
- **Escopo**: 3 cards de stats (Valor atual, Investido, Resultado com chip %); tabela de posições com exatamente 7 colunas (Ticker, Qtd, PM, Cotação, Valor atual, Resultado, %), linhas 13px padding 13/22px hover `rgba(raised,.55)`, sem linha expansível; form de operação em card (ticker, qtd, preço, data, segmented compra/venda) mantendo `TickerCombobox`; remover do render os gráficos e o `BenchmarkComparison` (manter arquivos/rotas do server intactos — só sai da UI); cores up/down no P&L; tabular-nums.
- **Fora de escopo**: mudanças em `portfolio.ts` do server; validação de SELL (dívida conhecida, fora deste ciclo); alertas e import CSV (manter acessíveis onde estão ou registrar no `TODO-HUMANO.md` se o design não prevê lugar para eles).
- **Critério de aceite**: registrar compra/venda atualiza a tabela; valores idênticos aos do dashboard atual para a mesma carteira (sem regressão de cálculo); tabela com scroll próprio em 360px sem overflow da página; build web ok. Justificativa de teste: UI sobre serviços já testados (`portfolio.test.ts`); nenhum cálculo novo no front.
- **Resultado**: —

## Concluídas

> Autorização permanente do humano (2026-07-24, via chat): orquestrador abre as PRs e faz o merge automático (resolvendo conflitos); revisão humana passa a ser a posteriori sobre as PRs.

### T-007 — Backend: layers Poupança/Reserva e Metas (schema + rotas + tipos + testes)
- **Status**: CONCLUIDA e MERGEADA — PR [#51](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/51) (2026-07-24)
- **Branch**: `giovane/t-007-backend-poupanca-metas`
- **Resultado**: tabelas `savings_entries` (livro DEPOSIT/WITHDRAW/YIELD, saldo derivado) e `goals`; rotas `/api/savings` (GET com summary calculado no server: balance/totalDeposits/totalYield/totalWithdrawals), `/api/goals` (PATCH parcial); 7 tipos em `shared/`, 7 funções fetch em `api.ts`, `CLAUDE.md` atualizado. 26 testes novos (goals 15, savings 11); suíte 13 arquivos / 118 testes verde; build ok. Revisor: APROVADA, 0 bloqueantes ("zero regressões, zero desvio de escopo"). Ressalva futura: teste explícito de summary para usuário sem lançamentos.

### T-005 — Landing + Login v4 (`/`)
- **Status**: CONCLUIDA e MERGEADA — PR [#50](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/50) (2026-07-24; inclui commit `d1dd385` do orquestrador corrigindo comentário do `ThemeToggleButton`, ressalva do revisor)
- **Branch**: `giovane/t-005-landing-login-v4`
- **Resultado**: `AuthPage.tsx` reescrita no layout do handoff (grid 1.5fr/1fr, card de apresentação com mascotes + card de login, rodapé brapi.dev) usando os primitivos das T-003/T-004; toggle de tema unificado no `ThemeToggleButton`; estilos em `App.css` (`.vw-landing-*`), `index.css` e backend intocados. Fluxo de auth preservado. Revisor: APROVADA, 0 bloqueantes — fidelidade conferida linha a linha; mascotes verificados via dev server (HTTP 200). Ressalva em aberto: **validação visual humana em 360/860px** (revisor validou por CSS/HTTP, sem screenshot). Pendência para T-012: toggle inline do `WalletSelector` ainda a unificar.

### T-006 — Backend: layers Renda mensal e Despesas fixas (schema + rotas + tipos + testes)
- **Status**: CONCLUIDA e MERGEADA — PR [#49](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/49) (2026-07-24)
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-006-backend-renda-despesas`
- **Contexto**: primeiros backends dos novos layers (ciclo 2); modelagem por `user_id` sem vínculo com wallet (default do orquestrador, informativo no `TODO-HUMANO.md`).
- **Escopo**: tabelas `income_sources` e `fixed_expenses`; rotas `GET/POST/DELETE /api/income` e `/api/expenses` com `requireAuth`; tipos em `shared/`; funções fetch em `web/src/api.ts`; `CLAUDE.md` atualizado.
- **Critério de aceite**: (cumprido) 18 testes novos cobrindo criação, listagem isolada por usuário, exclusão, 404 cross-user, 401 e 400s; suíte inteira verde (11 arquivos, 92 testes); `pnpm build` completo sem erro.
- **Resultado**: 9 arquivos tocados (`db.ts`, `routes/income.ts`+teste, `routes/expenses.ts`+teste, `index.ts`, `shared/src/index.ts`, `web/src/api.ts`, `CLAUDE.md`). Revisor: APROVADA, zero bloqueantes — verificou isolamento rigoroso (`user_id` só de `res.locals`, DELETE cross-user retorna 404 sem vazar existência, SQL 100% parametrizado), validação completa de input e docs fiéis. Ressalva não bloqueante: os testes novos são os primeiros de rota Express+DB real do repo e usam `import()` dinâmico em `beforeAll` para setar `DATABASE_URL` antes do load de `db.ts` (necessário por hoisting de imports; revisor confirmou solução sólida) — **padrão a reutilizar na T-007** e a documentar futuramente.

### T-004 — Shell do app v4: rotas por layer, header sticky com logo dinâmica, animação de entrada
- **Status**: CONCLUIDA e MERGEADA — PR [#48](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/48) (2026-07-24; inclui commit `f3a555d` do orquestrador reconciliando o stub de tema com o `theme.ts` da T-003)
- **Prioridade**: P1
- **Depende de**: — (paralela a T-003)
- **Branch/worktree**: `giovane/t-004-shell-rotas-v4` (commit `0dadf55`)
- **Contexto**: estrutura de navegação do v4 (ciclo 2, handoff "Screens/Views").
- **Escopo**: rotas `/`, `/home`, `/renda`, `/despesas`, `/poupanca`, `/metas`, `/cripto`, `/carteiras`, `/dash/:id` com react-router v7; guards de autenticação; header sticky com logo (mascote por rota) + saudação + toggle de tema + sair; animação fade+rise reutilizável; placeholders nas rotas de layer.
- **Critério de aceite**: (cumprido) navegação completa com header persistente e logo correta; redirect de rota protegida sem sessão; dashboard de ações sem regressão em `/dash/:id`; build verde. Teste dispensado (navegação/UI, web sem runner).
- **Resultado**: `App.tsx` refatorado para roteamento; novos `layout/` (AppShell, ProtectedShell, ShellContext, mascots, LoadingScreen) e `routes/` (LandingRoute, HomePage, LayerPlaceholderPage, CriptoPage, CarteirasPage, DashboardPage, AdminRoute); `WalletSelector` ganhou modo `embedded`; `ThemeToggleButton` novo; `/admin` preservado com guard de role. Revisor: APROVADA, sem bloqueantes — verificou map mascote→rota exato, guards sem loop/flash, e que `DashboardPage` reproduz fielmente o fluxo antigo de refresh (operações, CSV, alertas, benchmarks). Ressalvas: (1) stub de tema em `App.tsx:15-23,44-57` duplica o `theme.ts` da T-003 (mesma chave `vw-theme`, comportamento não divergente) — **reconciliar no merge: `theme.ts` vira fonte única**; (2) `ThemeToggleButton` coexiste com toggles antigos de `AuthPage`/`WalletSelector` — unificar nas T-005/T-012; (3) executor adiantou `HomePage` (T-008) e `CriptoPage` (T-011) além do placeholder — enxutos e fiéis ao handoff, T-008/T-011 ajustadas em função disso.

### T-003 — Design tokens v4: tema light/dark neutro, fonte Geist e mascotes
- **Status**: CONCLUIDA e MERGEADA — PR [#47](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/47) (2026-07-24)
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-003-design-tokens-v4`
- **Contexto**: base visual do refactor v4 (ciclo 2) — tokens do handoff `design_handoff_vetor_wallet_refactor/README.md`.
- **Escopo**: tokens light/dark do handoff em `web/src/index.css` (@theme Tailwind v4 + custom properties), mecânica de tema (`.light`/`.dark` no `<html>`, `localStorage['vw-theme']`, `color-scheme`), fonte Geist, tipografia/formas base, mascotes em `web/public/layers/`.
- **Critério de aceite**: (cumprido) troca de classe no `<html>` troca o tema inteiro; persistência após reload; mascotes servidos em `/layers/*.png`; build web verde. Teste dispensado (visual/CSS, web sem runner — issue #6).
- **Resultado**: Arquivos: `web/src/index.css` (reescrito — valores do handoff conferidos hex a hex pelo revisor, nomes de variáveis antigos preservados: nenhum componente precisou de edição), `web/src/theme.ts` (novo — get/set/toggle/init), `web/src/main.tsx` (initTheme), `web/index.html` (pré-paint default light, sem flash), `web/public/layers/*.png` (6 mascotes). Build + lint verdes; PNGs verificados via HTTP 200. Revisor: APROVADA, sem bloqueantes. Ressalvas não bloqueantes: (1) o próprio handoff tem hex vs rgb divergentes para `raised`/`edge` — executor seguiu os hex, consistentes; (2) alias duplicado `--color-surface`/`--color-raised` herdado de antes, limpeza futura. Pendência de integração: reconciliar com o stub de tema criado pela T-004 (usar `theme.ts` como fonte única no merge).

### T-001 — Aplicar paleta 60-30-10 via CSS custom properties
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovação humana)
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-001-paleta-60-30-10` (commit `c04a925`) — PR [#44](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/44)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` — redesign visual com regra 60-30-10. A proposta de paleta vai para o `TODO-HUMANO.md` para aprovação antes de merge.
- **Escopo**: Definir a paleta 60-30-10 (avaliar se mantém o tom areia `#e3d5b8` como base) e aplicá-la exclusivamente via CSS custom properties em `web/src/index.css`. Documentar em comentário no `index.css` qual cor é 60, qual é 30 e qual é 10. Preservar cores semânticas de lucro/prejuízo (verde/vermelho) fora da conta 60-30-10. Ajustar usos de cor hardcoded nos componentes apenas se necessário para que consumam as variáveis.
- **Fora de escopo**: responsividade/media queries (T-002); framework CSS novo; mudanças de layout ou markup além de troca de cor.
- **Critério de aceite**: todas as cores de tema saem de custom properties em `index.css`; comentário documenta o papel 60/30/10 de cada cor; verde/vermelho de P&L intactos; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudança puramente visual (CSS) — política do CLAUDE.md dispensa teste novo.
- **Resultado**: O tema existente já seguia a proporção 60-30-10; o executor manteve todos os valores de cor e documentou os papéis em comentário (`index.css`, único arquivo alterado). Paleta: 60% canvas `#0f0e0b` dark / `#f4efe5` light; 30% cards/superfícies/bordas; 10% destaque areia `#e3d5b8` dark / `#a8814f` light (mantido por ser identidade da marca). P&L verde/vermelho fora da conta, intactos. Build ok. Revisor: APROVADA, com ressalva de que isso cumpre o critério literal da tarefa mas não constitui o "redesign" da prioridade 1 — decisão registrada no `TODO-HUMANO.md`.

### T-002 — Responsividade mobile (viewport ≥360px) em todas as telas
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovação humana)
- **Prioridade**: P1
- **Depende de**: — (paralela a T-001; toca `App.css` e componentes, não `index.css`)
- **Branch/worktree**: `giovane/t-002-responsividade-mobile` (commit `7b4b807`) — PR [#45](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/45)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` — todas as telas usáveis em mobile.
- **Escopo**: Tornar dashboard, operações, auth e admin usáveis em viewport ≥360px: tabelas com scroll horizontal próprio ou layout empilhado, formulários em coluna única, gráficos redimensionando. Media queries e ajustes de layout em `web/src/App.css` e nos componentes (`PortfolioDashboard.tsx`, `OperationsList.tsx`, `OperationForm.tsx`, `AuthPage.tsx`, `AdminPage.tsx` etc.). NÃO editar `web/src/index.css` (reservado à T-001).
- **Fora de escopo**: troca de paleta/cores (T-001); framework CSS novo; mudança de funcionalidade.
- **Critério de aceite**: telas legíveis e operáveis em 360px, 768px e desktop sem overflow horizontal da página; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudança de estilo/layout — política do CLAUDE.md dispensa teste novo; web ainda sem runner (issue #6).
- **Resultado**: 8 arquivos alterados: `App.css` (antes órfão, agora importado em `main.tsx`) com safety-net `overflow-x: hidden` global e media query do WalletSelector; formulários (`OperationForm`, `AlertsPanel`) em coluna única no mobile; chip da carteira ativa truncado no header (`App.tsx`); `AdminPage` empilha data+botão; `CsvImport` com `flex-wrap`. Tabelas do dashboard/operações já rolavam em container próprio (verificado pelo revisor). `index.css` intocado (sem conflito com T-001). Build ok. Revisor: APROVADA; risco remanescente: `overflow-x: hidden` global pode mascarar overflow futuro — recomendado teste manual em navegador (360/768px) antes do merge.
