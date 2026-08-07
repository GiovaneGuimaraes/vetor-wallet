# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`
>
> **Higiene**: ao encerrar um ciclo, o orquestrador move os detalhes das tarefas concluídas para o [`BACKLOG-ARQUIVO.md`](./BACKLOG-ARQUIVO.md), deixando aqui apenas uma linha de resumo por ciclo — este arquivo é lido em toda sessão e precisa ficar enxuto.

## Modelo de tarefa

```markdown
### T-001 — Título curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Complexidade**: baixa | média | alta — define o modelo do executor/revisor (ver "Roteamento de modelos" no README.md)
- **Depende de**: — (ou T-xxx; tarefas com dependência não paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe
- **Escopo**: o que fazer, arquivos-alvo prováveis
- **Fora de escopo**: o que NÃO fazer
- **Critério de aceite**: verificável + comando de teste
- **Resultado**: (ao concluir: PR, veredito do revisor, sugestões registradas, modelos usados)
```

---

## Tarefas ativas

> **Ciclo 16 — direcionamento do humano (2026-08-02)**, a partir da revisão completa do app feita em sessão com o Claude (tour como usuário real + pesquisa de integrações bancárias). Três ondas, executar em ordem: **Onda A** (modo consulta — UX dos layers), **Onda B** (achados menores da revisão), **Onda C** (importação bancária: OFX primeiro, Pluggy depois). Dentro de cada onda, tarefas sem dependência entre si podem paralelizar (arquivos distintos). Nota: as pages podem ter mudado com o gating de assinatura do Ciclo 15 (T-069–T-073, monetização) — executores partem da `main` atual.

### Onda A — "Modo consulta" nos layers

> Diretriz do humano: "acho muito carregado as pages dentro dos layers — todas têm forms e às vezes o user só quer ver a situação e as projeções". Padrão único: **página abre em modo consulta** (resumo → gráficos/projeções → listas); formulários ficam recolhidos atrás de um botão "+ Adicionar" por página. Edição inline dos itens de lista (T-031) permanece como está.

### T-074 — Padrão de formulário recolhível + aplicar em /despesas
- **Status**: CONCLUIDA — PR #120 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). 385 testes web (12 novos em `despesasForm.test.ts`). Componente `CollapsibleSection` genérico (controle externo via `open`/`onOpenChange` p/ deep-link da T-076). NOTA p/ T-082: a seção de orçamentos NÃO era renderizada na `main` (fora do render desde a T-037) — a T-082 precisa REINTRODUZIR a seção, não só o caso 0%. Sugestões não-bloqueantes do revisor: extrair `emptyFields` interno em `despesasForm.ts`; catch de `handleAddSubmit` referencia `parsed` fora do try (risco teórico).
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: —
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: toda page de layer mistura consulta e edição no mesmo nível visual; `/despesas` tem 2 forms permanentes ("Nova despesa fixa" e "Novo lançamento") e no mobile a página fica enorme. O uso real é consulta ~10× mais frequente que lançamento.
- **Escopo**: criar o padrão compartilhado de seção recolhível (componente em `web/src/components/` + CSS em `layers.css`, seguindo tema via custom properties) com estado aberto/recolhido; aplicar na `DespesasPage.tsx`: fundir os dois forms num único form com toggle **Fixa/Variável** (variável mantém data + "repetir todo mês"), recolhido por padrão atrás de "+ Adicionar despesa". Ordem da página em modo consulta: total do mês → últimos meses → orçamentos → recorrências → listas.
- **Fora de escopo**: mudanças de regra de negócio ou de API; as demais pages (T-075–T-078).
- **Critério de aceite**: `/despesas` abre sem nenhum form visível; "+ Adicionar despesa" revela o form unificado; criar fixa e variável (com recorrência) continua funcionando; lógica nova extraída em módulo puro com teste ao lado (ex.: estado do toggle/payload do form); `pnpm --filter vetor-wallet-web test` verde.
- **Resultado**:

### T-075 — /renda em modo consulta
- **Status**: CONCLUIDA — PR #123 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet (APROVADA). 396 testes web (11 novos em `rendaForm.test.ts`); campo `type` da fonte fixa preservado.
- **Prioridade**: P1
- **Complexidade**: baixa
- **Depende de**: T-074
- **Branch/worktree**:
- **Contexto**: mesmo problema da T-074 na `RendaPage.tsx` (forms "Nova fonte fixa" e "Nova renda do mês" sempre abertos).
- **Escopo**: aplicar o padrão da T-074: um único "+ Adicionar renda" com toggle **Fixa/Avulsa** (avulsa mantém data).
- **Fora de escopo**: regras de negócio/API.
- **Critério de aceite**: `/renda` abre sem form visível; ambos os fluxos de criação funcionam; testes web verdes.
- **Resultado**:

### T-076 — /poupanca em modo consulta + projeção pré-preenchida
- **Status**: CONCLUIDA — PR #124 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet. REPROVADA 1× (race: `defaultOpen` não-controlado congelava antes do fetch popular `derivedRatePct`), corrigida (seção controlada + sync única em `loading → false`) e APROVADA na re-revisão. 398 testes web. Sugestão não-bloqueante do revisor: PoupancaPage não tem teste de render (só módulos puros) — teste de componente com fetch mockado evitaria essa classe de bug.
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: T-074
- **Branch/worktree**:
- **Contexto**: `/poupanca` tem 3 blocos de ação sempre abertos (transferir para meta, previsão de rendimento, novo lançamento) antes da lista. A previsão exige preencher campos antes de mostrar qualquer coisa — vira "trabalho" em vez de consulta.
- **Escopo**: `PoupancaPage.tsx`: ordem em modo consulta = 4 cards de resumo → previsão de rendimento → lançamentos; "Novo lançamento" e "Transferir para uma meta" recolhidos (padrão T-074; o deep-link `?meta=<id>` da T-041 deve abrir a seção de transferência já expandida). Previsão de rendimento renderiza automaticamente com defaults (valor inicial = saldo, como já faz; taxa = sugerida do histórico quando houver — T-040; prazo 12), com os inputs numa área "ajustar premissas" recolhível; sem histórico de taxa, mantém o pedido de taxa, mas dentro da área recolhível.
- **Fora de escopo**: mudar cálculo da projeção (T-040) ou regras de transferência (T-041).
- **Critério de aceite**: `/poupanca` abre sem form aberto e, com dados suficientes, a projeção aparece sem interação; `?meta=<id>` expande a transferência; lógica nova (defaults da projeção) em módulo puro testado; testes web verdes.
- **Resultado**:

### T-077 — /dash em modo consulta (resumo antes do form) + overflow mobile
- **Status**: CONCLUIDA — PR #122 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet (APROVADA). Overflow mobile já era garantido pelo CSS existente (verificado por inspeção — nenhuma mudança de CSS); sem teste novo (reorder de JSX, justificativa validada).
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: T-074
- **Branch/worktree**:
- **Contexto**: no mobile (390px) o form "Nova Operação" é a **primeira** coisa da `/dash`, antes do valor da carteira (evidência da revisão de 2026-08-02); a tabela de posições clipa a coluna "Cotação" na borda.
- **Escopo**: `DashboardPage.tsx`: mover "Nova Operação" para depois dos cards de resumo, recolhida no padrão T-074 ("+ Nova operação"); "Projeção de ganhos" com premissas numa área "ajustar" recolhível (valor atual já é pré-preenchido); garantir `overflow-x: auto` no container da tabela de posições (e conferir a de operações) no mobile.
- **Fora de escopo**: gráficos e cálculos existentes; alertas/import (sem UI, T-026).
- **Critério de aceite**: `/dash` abre mostrando resumo primeiro em qualquer viewport; form recolhido por padrão e funcional; tabela de posições rolável horizontalmente a 390px sem clipar; testes web verdes.
- **Resultado**:

### T-078 — /metas: form "Nova meta" recolhido
- **Status**: CONCLUIDA — PR #121 mergeado (2026-08-02). Executor Haiku (1ª tarefa Haiku do roteamento novo — aprovada de primeira), revisor Sonnet (APROVADA sem achados).
- **Prioridade**: P2
- **Complexidade**: baixa
- **Depende de**: T-074
- **Branch/worktree**:
- **Contexto**: consistência do padrão — `/metas` abre com o form "Nova meta" no topo, antes dos cards de progresso.
- **Escopo**: `MetasPage.tsx`: cards de metas primeiro; "+ Nova meta" recolhido (padrão T-074).
- **Fora de escopo**: regras de progresso (T-024).
- **Critério de aceite**: `/metas` abre nos cards; criação de meta funcional; testes web verdes.
- **Resultado**:

### Onda B — Achados menores da revisão de 2026-08-02

### T-079 — Aviso não-bloqueante de saque acima do saldo na poupança
- **Status**: CONCLUIDA — PR #126 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet (APROVADA). Confirmação inline no form (sem `window.confirm`); `wouldOverdrawBalance` em centavos inteiros, 404 testes web. Sugestão não-bloqueante: mensagem distinta quando o saldo JÁ está negativo antes do saque (edge case).
- **Prioridade**: P2
- **Complexidade**: média
- **Depende de**: T-076 (mesmo arquivo)
- **Branch/worktree**:
- **Contexto**: o server aceita WITHDRAW acima do saldo por decisão documentada (razão livre — `savings-goals.md`), mas a UI não avisa nada: um erro de digitação gera saldo negativo silenciosamente (testado: saque de R$ 99.999 com saldo de R$ 5.042 passou sem aviso).
- **Escopo**: na `PoupancaPage.tsx`, ao submeter WITHDRAW com valor que deixaria o saldo negativo, exibir confirmação/aviso não-bloqueante ("isso deixa seu saldo negativo — confirmar?") antes do POST. Predicado em módulo puro (ex.: junto de `savingsTransfer.ts` ou novo `savingsWithdraw.ts`) com teste, comparação em centavos inteiros (padrão T-041/T-052).
- **Fora de escopo**: mudar o server (a permissividade é decisão registrada).
- **Critério de aceite**: saque ≤ saldo não mostra aviso; saque > saldo pede confirmação e só envia após confirmar; função pura testada; testes web verdes.
- **Resultado**:

### T-080 — Onboarding na Home vazia (CTAs por card)
- **Status**: CONCLUIDA — PR #128 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet. REPROVADA 1× (CTA de Ações sem gate `walletLoaded && !walletLoadError`), corrigida e APROVADA na re-revisão. 424 testes web; proxy de "poupança vazia" documentado em `savings-goals.md`.
- **Prioridade**: P2
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**:
- **Contexto**: usuário novo vê a Home só com R$ 0,00 em tudo e nenhuma orientação de por onde começar (evidência da revisão: screenshot de conta recém-criada).
- **Escopo**: `HomePage.tsx` (+ `homeMetrics.ts` se precisar de predicado): quando um layer não tem dados, o card mostra um CTA curto ("Cadastre sua renda →", "Registre um gasto →", "Faça seu primeiro aporte →", "Crie uma meta →", "Registre uma operação →") no lugar do valor zerado. Cripto permanece "em breve".
- **Fora de escopo**: wizard/tour; mudanças de rota.
- **Critério de aceite**: com usuário sem dados, todos os cards ativos mostram CTA; com dados, comportamento atual inalterado; predicado "layer vazio" em módulo puro testado; testes web verdes.
- **Resultado**:

### T-081 — Corrigir alegação "dados criptografados" no rodapé da landing
- **Status**: CONCLUIDA — PR #125 mergeado (2026-08-02). Executor Haiku; diff de 1 linha verificado inline pelo orquestrador (sem revisor — correção trivial de copy).
- **Prioridade**: P2
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**:
- **Contexto**: `AuthPage.tsx` (rodapé da landing) diz "dados criptografados", mas com SQLite local padrão não há criptografia em repouso (só bcrypt nas senhas). Promessa de segurança imprecisa é pior que nenhuma.
- **Escopo**: trocar o texto por algo verdadeiro, ex.: "Cotações via brapi.dev · senhas com bcrypt · seus dados ficam no seu servidor".
- **Fora de escopo**: implementar criptografia em repouso.
- **Critério de aceite**: novo texto na landing; sem teste (mudança de copy — justificativa registrada aqui).
- **Resultado**:

### T-082 — Orçamentos sempre visíveis em /despesas (barra 0%)
- **Status**: CONCLUIDA — PR #127 mergeado (2026-08-02). Executor Sonnet, revisor Sonnet (APROVADA). Descoberta: `computeBudgetProgress` sempre produziu 0% — o problema era a seção fora do render desde a T-037; seção reintroduzida (lista sempre visível + form em CollapsibleSection). 400 testes web.
- **Prioridade**: P2
- **Complexidade**: média
- **Depende de**: T-074 (mesmo arquivo)
- **Branch/worktree**:
- **Contexto**: um teto de orçamento cadastrado só aparece quando a categoria tem gasto no mês corrente — até lá a feature fica invisível (testado: budget de R$ 900 em "alimentação" não aparece em agosto sem gasto na categoria).
- **Escopo**: `budgetProgress.ts` (+ uso na `DespesasPage.tsx`): toda categoria com teto definido aparece na seção de orçamentos, com barra a 0% e "R$ 0,00 de R$ X" quando não há gasto no mês. Lembrar da cópia espelhada de helpers server/web se tocar em algo duplicado (T-028).
- **Fora de escopo**: CRUD de budgets (já existe); vínculo com mês.
- **Critério de aceite**: budget sem gasto no mês renderiza a 0%; com gasto, comportamento atual; casos novos cobertos em `budgetProgress.test.ts`; testes web verdes.
- **Resultado**:

### T-083 — Navegação de volta nos layers ("← Início")
- **Status**: CONCLUIDA — PR #129 mergeado (2026-08-02). Executor Haiku, revisor Sonnet (APROVADA). `BackToHomeLink` reutilizável nas 6 pages; CriptoPage trocou botão hardcoded pelo componente. 426 testes web. **ONDA B COMPLETA.**
- **Prioridade**: P3
- **Complexidade**: baixa
- **Depende de**: T-074, T-075, T-076, T-077, T-078 (evita conflito nas mesmas pages)
- **Branch/worktree**:
- **Contexto**: dentro de um layer, o único caminho de volta à Home é clicar no logo — nada indica isso a um usuário novo.
- **Escopo**: link discreto "← Início" (ou breadcrumb mínimo) no topo das pages de layer (`/renda`, `/despesas`, `/poupanca`, `/metas`, `/dash`, `/cripto`), reutilizável, respeitando o tema.
- **Fora de escopo**: menu global/sidebar.
- **Critério de aceite**: toda page de layer tem o link de volta funcional; testes web verdes.
- **Resultado**:

> **Ciclo 17 — ajustes de UX pedidos pelo humano (2026-08-05)**, antes de retomar as ondas: (1) "+" duplicado nos botões de seção recolhível; (2) remover o card de orçamento do mês em /despesas; (3) botão "Adicionar" ilegível no dark mode; (4) redesign da página de planos no estilo X Premium (app free; plano libera Ações, Cripto e integração Pluggy). T-090 e T-091 paralelizam; T-088 → T-089 em sequência (mesmo arquivo `DespesasPage.tsx`).

### T-088 — Remover "+" duplicado nos labels de CollapsibleSection
- **Status**: CONCLUIDA — PR #134 mergeado (2026-08-05). Executor Haiku; diff de 7 labels verificado inline pelo orquestrador (sem revisor — precedente T-081). 442 testes web; nenhum teste asserava os textos.
- **Prioridade**: P1
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: `CollapsibleSection` já renderiza o ícone `+`/`−` (`components/CollapsibleSection.tsx:55-58`), mas 7 call sites prefixam o label com `"+ "`, renderizando "+ + Texto". Padrão correto de referência: "Importar extrato (OFX)" (`DespesasPage.tsx:785`) e "Ajustar premissas".
- **Escopo**: remover o prefixo `"+ "` dos 7 labels: `DespesasPage.tsx:677` e `:940`, `RendaPage.tsx:434`, `MetasPage.tsx:221`, `PoupancaPage.tsx:660` e `:764`, `DashboardPage.tsx:443`. Ajustar testes que asseram esses textos, se houver.
- **Fora de escopo**: mudar o componente `CollapsibleSection`; remover o card de orçamento (T-089).
- **Critério de aceite**: nenhum label de `CollapsibleSection` começa com `"+ "`; `pnpm --filter vetor-wallet-web test` verde.
- **Resultado**:

### T-089 — Remover o card "Orçamento do mês" de /despesas
- **Status**: CONCLUIDA — PR #137 mergeado (2026-08-05). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). 427 testes web (−15 do `budgetProgress.test.ts` removido); grep final sem sobras de `budget` no web; backend `/api/budgets` mantido sem consumidor (candidata: limpar rotas/tabela). Sugestão não-bloqueante: parágrafo antigo de `expenses-budgets.md` ainda cita `computeBudgetProgress`. **CICLO 17 COMPLETO** (sanidade na main: fast-forward limpo, suítes verdes nos 4 PRs).
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: T-088 (mesmo arquivo)
- **Branch/worktree**:
- **Contexto**: decisão do humano (2026-08-05): o card de orçamento complica o app sem agregar valor — remover. Reverte na prática a T-082 (que reintroduziu a seção). O card é o ÚNICO consumidor de budgets no front.
- **Escopo**: em `DespesasPage.tsx`, remover o bloco JSX (linhas ~889-970), estados/handlers/fetch de budgets (183-188, 197-203, 273/276, 284, 288, 305, 558-589, 625-634) e imports associados. Remover os órfãos: `budgetProgress.ts` + `budgetProgress.test.ts`, CSS `.vw-budget-*` em `layers.css:367-444`, e `getBudgets`/`upsertBudget`/`deleteBudget` em `api.ts:597-620`. Atualizar `docs/decisions/expenses-budgets.md` registrando a remoção da UI (backend `/api/budgets` permanece, sem consumidor).
- **Fora de escopo**: remover as rotas/tabela de budgets no server (fica como candidata caso o humano queira limpar o backend depois).
- **Critério de aceite**: `/despesas` não exibe nada de orçamento; nenhum código morto de budgets no web (grep por `budget` no web só encontra o `dashboard.css` se aplicável); `pnpm --filter vetor-wallet-web test` verde; build web verde.
- **Resultado**:

### T-090 — Corrigir botões `bg-accent text-white` ilegíveis no dark mode
- **Status**: CONCLUIDA — PR #135 mergeado (2026-08-05). Executor Haiku; diff de 3 trocas de classe verificado inline pelo orquestrador (sem revisor — trivial). `text-white` → `text-canvas` nos 3 componentes; sem teste novo (só classe CSS, justificativa pela política). 442 testes web.
- **Prioridade**: P1
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**:
- **Contexto**: no dark, `--color-accent` vira `#f5f5f4` (`index.css:123-125`), mas o texto é `text-white` hardcoded — botão branco com texto branco. Afeta o "Adicionar" da página de Ações (`OperationForm.tsx:185-191`) e também `AlertsPanel.tsx:179` e `CsvImport.tsx:239`.
- **Escopo**: nos 3 componentes, trocar `text-white` por `text-canvas` (padrão já usado em `AdminPage.tsx:109`) ou adotar `vw-btn-primary` — decisão do executor, consistente nos 3.
- **Fora de escopo**: mudar tokens de tema em `index.css`.
- **Critério de aceite**: os 3 botões legíveis em light e dark (contraste fundo × texto invertendo juntos); testes web verdes (sem teste novo se for só troca de classe — justificar).
- **Resultado**:

### T-091 — Redesign da página de planos (estilo X Premium: card vertical + features)
- **Status**: CONCLUIDA — PR #136 mergeado (2026-08-05). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). 447 testes web (+5 em `planos.test.ts` p/ `yearlySavingsPercent`). Sugestões não-bloqueantes: mover `PRO_FEATURES` para depois dos imports; `yearlySavingsPercent` usa float (aceitável — é percentual arredondado, não dinheiro).
- **Prioridade**: P2
- **Complexidade**: média
- **Depende de**: —
- **Branch/worktree**:
- **Contexto**: direcionamento do humano (2026-08-05), referência `https://x.com/i/premium_sign_up`: o app é **free** — o plano dá acesso a Ações, Criptomoedas e integração bancária automática (Pluggy). Os cards atuais (`PlanosPage.tsx`, `planos.css`) são grandes e sem lista de benefícios; devem ficar menores e mais verticais (proporção coluna, não bloco largo).
- **Escopo**: `PlanosPage.tsx` + `planos.css` (+ `planos.ts` se precisar de lógica pura): cards mais estreitos/verticais (ex.: `max-width` ~280-320px, centralizados), cada um com nome → preço em destaque → lista de features com check (✓ Layer de Ações da B3, ✓ Criptomoedas, ✓ Importação automática via Pluggy — e o free implícito no texto da página: renda, despesas, poupança e metas grátis); destacar o anual (badge de economia usando `monthlyEquivalentCents` já existente); manter botão "Assinar" (`vw-btn-primary`) e todo o fluxo de assinatura/Pix intacto. Copy deixando claro que o app é gratuito e o plano desbloqueia os recursos avançados. Tema via CSS custom properties, light e dark.
- **Fora de escopo**: mudar gating de assinatura (T-071), rotas de billing, seeds de planos no server; implementar cripto/Pluggy (a feature list é promessa de produto já direcionada pelo humano).
- **Critério de aceite**: cards verticais e menores com lista de features; fluxo de assinatura continua funcionando; lógica nova em módulo puro testado (`planos.test.ts`); `pnpm --filter vetor-wallet-web test` verde.
- **Resultado**:

> **Ciclo 18 — página de conta do usuário (2026-08-05)**, pedido do humano após validar a simulação de plano: page para o usuário alterar seus dados (nome, celular), trocar senha e ver a assinatura. Sequência executada: T-092 (server) → T-093 (page /conta) → T-094 (troca de senha); T-095 (flaky) em paralelo.

### T-092 — Perfil no server: colunas name/phone + PATCH /api/auth/me
- **Status**: CONCLUIDA — PR #138 mergeado (2026-08-05). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). 742 testes server. Colunas `name`/`phone TEXT NULL` (ALTER idempotente); phone normalizado para dígitos (`^(55)?\d{10,11}$`); GET/register/login retornam `name`/`phone`/`created_at`; `isValidEmail` extraído do router p/ o service; tipo `User` no shared atualizado. Email no PATCH ignorado por desestruturação (mesmo padrão das demais rotas PATCH). Sugestão não-bloqueante: espelhar em `schema.test.ts` o teste de boot-duplo dos ALTERs (padrão T-084).
- **Prioridade**: P1 · **Complexidade**: média · **Depende de**: —

### T-093 — Page /conta: editar perfil + informações da assinatura
- **Status**: CONCLUIDA — PR #139 mergeado (2026-08-05). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). 445 testes web (+13 em `conta.test.ts`). Rota `/conta` (card "Meus dados" com email read-only + nome/celular editáveis via `updateMe()`; card "Assinatura" nos 3 estados; link "Conta" e saudação pelo nome no header). Estado global via `onUserUpdated` novo no ShellContext (PATCH devolve o User completo, sem refetch). Sugestão não-bloqueante: `formatPhoneForDisplay` dropa o prefixo `55` — reenvio sem edição re-normaliza silenciosamente (server aceita ambos).
- **Prioridade**: P1 · **Complexidade**: média · **Depende de**: T-092

### T-094 — Troca de senha na page /conta
- **Status**: CONCLUIDA — PR #140 mergeado (2026-08-05). Executor Sonnet, revisor Sonnet (APROVADA sem bloqueantes). `POST /api/auth/change-password` (400 genérico p/ senha atual errada; sessão preservada; usuário deletado → destrói sessão + 401) + seção "Alterar senha" na /conta com confirmação (validação pura em `conta.ts`). 748 testes server / 449 web. Sugestão não-bloqueante: `findUserById` retorna `password_hash` (uso interno apenas — atenção em reutilizações). CLAUDE.md (tabela de rotas) atualizado pelo executor.
- **Prioridade**: P2 · **Complexidade**: média · **Depende de**: T-092, T-093

### T-095 — Corrigir flakiness noturno de benchmarksHistory.test.ts
- **Status**: CONCLUIDA — PR #141 mergeado (2026-08-05). Diagnóstico do orquestrador: a rota ancora a janela em data BRT (`benchmarks.ts:83`) mas `buildIbovespaSeries` data pontos em UTC (`benchmarkHistory.ts:95`) — o mock com `Date.now()` caía fora da janela entre ~21h e 0h BRT (era a "falha pré-existente" vista nas T-092/T-094). Fix só no teste: timestamp = meio-dia UTC da data BRT de hoje. Executor Haiku; fix correto, mas o relatório alegou falha residual inexistente (orquestrador validou 4/4 verdes às 22:22 BRT) e duplicou um comentário (removido pelo orquestrador na branch). Suítes na main: 748 server + 449 web. **CICLO 18 COMPLETO.** Candidata registrada abaixo: datar `buildIbovespaSeries` em BRT (candle noturno pode ser recortado em produção).
- **Prioridade**: P2 · **Complexidade**: baixa · **Depende de**: —

### Onda C — Importação bancária (OFX primeiro, Pluggy depois)

> Estratégia decidida com o humano (2026-08-02): OFX como fundação sem dependência de terceiros (todos os bancos brasileiros relevantes exportam OFX), Pluggy/Meu Pluggy (Conector 200, gratuito para uso pessoal) como automação por cima do mesmo pipeline. Integração direta com Open Finance/bancos foi descartada (inviável para PF; pesquisa registrada na sessão de 2026-08-02).

### T-084 — `external_id` + importação idempotente em income/expense entries
- **Status**: CONCLUIDA — PR #130 mergeado (2026-08-03). Executor Opus (plano do spike na íntegra), revisor Opus (APROVADA sem bloqueantes). 687 testes server (+37). Desvios aceitos: `insertEntryWithExternalId` devolve `row` uniforme e recebe `values: Record` com guard de chaves. Sugestões não-bloqueantes: guard de runtime p/ `table`; SELECT pós-INSERT fora do try; `recurring` como string `'true'` escapa da regra `recurring×externalId` (semântica pré-existente da rota).
- **Prioridade**: P1
- **Complexidade**: alta
- **Depende de**: —
- **Branch/worktree**:
- **Contexto**: qualquer importador (OFX agora, Pluggy depois) precisa reimportar o mesmo arquivo/período sem duplicar lançamentos. Hoje `income_entries`/`expense_entries` não têm identificador externo.
- **Escopo**: coluna `external_id TEXT NULL` em `income_entries` e `expense_entries` (ALTER idempotente em `migrations.ts`, padrão `db-schema.md`) + índice único parcial por `(user_id, external_id)` com `external_id NOT NULL`; POST das duas rotas aceita `externalId` opcional (validado string não-vazia); conflito de dedupe responde de forma distinguível (ex.: 409 ou flag `duplicate` — decisão do executor, registrada). Considerar spike Plan antes (toca schema + duas rotas de dinheiro).
- **Fora de escopo**: parser OFX (T-085); UI (T-086); expor `external_id` na listagem.
- **Critério de aceite**: migração idempotente (boot 2× sem erro); POST com `externalId` repetido não cria segundo registro e sinaliza; POST sem `externalId` inalterado; testes de rota server (banco temporário, `DATABASE_URL` antes do import do db) cobrindo os três casos; `pnpm --filter vetor-wallet-server test` verde.
- **Resultado**:

### T-085 — Parser OFX + importação de extrato no server
- **Status**: CONCLUIDA — PR #131 mergeado (2026-08-03). Executor Opus, revisor Opus (APROVADA sem bloqueantes). 726 testes server (+39). Decisões: corpo cru 1 MB com charset pelo header OFX; parser scanner único SGML/XML; data local mantida; sempre 200 com relatório (`imported/duplicated/rejected` + `entryId`); 400 só corpo vazio/sem `<OFX>`. Sugestões não-bloqueantes do revisor: (1) content-type JSON cai em "Body vazio" enganoso — a UI da T-086 NÃO deve enviar JSON; (2) sem teto de nº de transações por arquivo (~15-20k STMTTRN cabem em 1 MB); (3) linha `rejected` omite `entryType` legível e não trunca description; (4) `decodeEntities` aceita surrogates solitários.
- **Prioridade**: P1
- **Complexidade**: alta
- **Depende de**: T-084
- **Branch/worktree**:
- **Contexto**: caminho de integração bancária que não depende de terceiro: Nubank, Itaú, BB, Inter, C6, Mercado Pago etc. exportam OFX no internet banking. O `POST /api/import` atual só aceita CSV de corretora (operações B3).
- **Escopo**: novo endpoint (ex.: `POST /api/import/ofx`) que recebe OFX de conta/cartão e mapeia: crédito → `income_entries`, débito → `expense_entries`; categoria derivada do memo via `normalizeCategory` (fallback "outros"); `external_id` = FITID (dedupe da T-084); resposta com relatório por transação (importada/duplicada/rejeitada + motivo), no espírito da rejeição por linha do CSV. Parser próprio (OFX 1.x SGML e 2.x XML) em service testável com fixtures — sem lib nova sem necessidade; validações de data/dinheiro existentes (`isValidIsoDate`, `isValidMoneyAmount`).
- **Fora de escopo**: UI (T-086); classificação inteligente de categoria; transferências entre contas próprias (importam como estão; refino é candidata).
- **Critério de aceite**: fixtures OFX (mín. 2 formatos de banco) importam com dedupe funcionando em reimport; relatório por transação correto; testes de rota + parser; suíte server verde.
- **Resultado**:

### T-086 — UI mínima de importação OFX
- **Status**: CONCLUIDA — PR #132 mergeado (2026-08-03). Executor Sonnet, revisor Sonnet (APROVADA). 442 testes web (+16). Corpo cru `application/octet-stream` + `arrayBuffer()` (charset decidido no server); refetch pós-import com `force` do MonthFetchGuard (ressalva multi-mês documentada). Sugestão cosmética: `vw-ofx-report` sem regra CSS própria. **ONDA C EXECUTÁVEL COMPLETA** (sanidade na main: 726 server + 442 web + build verdes). Resta só T-087 (bloqueada por credenciais).
- **Prioridade**: P2
- **Complexidade**: média
- **Depende de**: T-085, T-074
- **Branch/worktree**:
- **Contexto**: o import de CSV ficou sem UI por decisão antiga (T-026); o OFX precisa de porta de entrada visível para ser útil ao usuário real.
- **Escopo**: seção recolhível "Importar extrato (OFX)" (padrão T-074) na `/despesas`, com upload do arquivo e exibição do relatório por transação retornado pela T-085. Lógica de apresentação do relatório em módulo puro testado.
- **Fora de escopo**: UI para o CSV de corretora (segue T-026); caixa de entrada de revisão (candidata).
- **Critério de aceite**: upload de OFX válido mostra contagens (importadas/duplicadas/rejeitadas) e detalhe por transação; reimport do mesmo arquivo mostra tudo como duplicado e não duplica dados; testes web verdes.
- **Resultado**:

### T-087 — Job `pluggy:sync` no cli (Meu Pluggy / Conector 200)
- **Status**: BLOQUEADA — aguarda credenciais do humano (ver `TODO-HUMANO.md` item 2026-08-02)
- **Prioridade**: P2
- **Complexidade**: alta
- **Depende de**: T-084 (e credenciais no `TODO-HUMANO.md`)
- **Branch/worktree**:
- **Contexto**: Meu Pluggy (meu.pluggy.ai) dá acesso gratuito via API às contas do próprio usuário conectadas por Open Finance (Conector 200) — único caminho automático viável para PF. Pesquisa completa registrada na sessão de 2026-08-02.
- **Escopo**: **após o Ciclo 19, o client da Pluggy nasce direto como `packages/pluggy-core`** (categoria Integração, módulo BankImport — ver `docs/MODULES.md`), não em `services/`: autenticação e busca de transações ficam no core, sem tocar o banco; o mapeamento para entries e a gravação ficam no `bank-import-core`. O job `pluggy:sync` em `packages/cli` (padrão do `insights:hourly`) só orquestra. Autentica com `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` (novos no `.env.example` do cli), busca transações das contas conectadas desde o último sync, insere com `external_id` = id da transação Pluggy — crédito → income entry, débito → expense entry, categoria Pluggy mapeada para `normalizeCategory`. Flag `--dry-run` imprime sem gravar. Estado do último sync persistido (tabela pequena ou derivado do max `date` importado — decisão do executor, registrada).
- **Fora de escopo**: endpoint `investments` da Pluggy (candidata para reconciliar posição B3); UI; agendamento (roda manual como o insights).
- **Critério de aceite**: com credenciais de teste/mocks, `pnpm --filter vetor-wallet-cli pluggy:sync -- --dry-run` lista transações sem gravar; execução real é idempotente (2ª rodada não duplica — dedupe T-084); testes das funções de mapeamento; suítes verdes.
- **Resultado**:

> **Ciclo 19 — refatoração da arquitetura em módulos (2026-08-06)**, pedido do humano ANTES de retomar as ondas do Ciclo 16. Adotar o modelo de módulos da OneClick Ads: `packages/*-core` irmãos de `web`/`rest-api`/`db`, cada um com seu `CLAUDE.md`. Documentos governantes: [`docs/MODULES.md`](../MODULES.md) e [`docs/PACKAGES.md`](../PACKAGES.md).
>
> **Sequência obrigatória, uma tarefa por PR, sem paralelizar** — todas mexem em arquivos que qualquer outra tarefa toca; duas em voo viram conflito em série. Nenhuma tarefa deste ciclo pode alterar comportamento: são movimentações mecânicas, e a suíte inteira deve passar **com o mesmo número de testes** antes e depois. Se um teste precisar mudar além do caminho de import, pare e reporte.
>
> **Baseline verde medido na `main` em 2026-08-06 (commit `dba8603`), antes da T-097:**
> **server 748 testes / 48 arquivos**, **web 449 testes / 26 arquivos** — total **1197**. `pnpm build` verde (server → `dist/api/index.js`, web → 104 módulos). Todo PR do Ciclo 19 tem que reproduzir exatamente estes números.

### T-096 — Documentos de arquitetura (MODULES.md + PACKAGES.md)
- **Status**: CONCLUIDA — feito pelo orquestrador direto na `main` (2026-08-06), sem PR (docs-only, nenhum código tocado).
- **Prioridade**: P1
- **Complexidade**: baixa
- **Depende de**: —
- **Contexto**: a refatoração precisa de um alvo escrito antes de qualquer arquivo se mover, senão cada executor inventa o seu.
- **Escopo**: `docs/MODULES.md` (8 módulos, packages de cada um, invariantes), `docs/PACKAGES.md` (tabela, categorias, regras de dependência, árvore "onde colocar este código") e seção "Arquitetura em módulos" no `CLAUDE.md` raiz.
- **Resultado**: os três arquivos marcam explicitamente cada package como *(planejado)* com a coluna "Hoje em", para não induzir agente a procurar package inexistente.

### T-097 — Extrair `packages/db`
- **Status**: PENDENTE
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: T-096
- **Branch/worktree**:
- **Contexto**: primeira extração porque é a de dependência mais rasa (não importa nenhum core) e destrava as demais — todo `*-core` de domínio vai depender dela.
- **Escopo**: mover `packages/server/src/db/` (`client.ts`, `schema.ts`, `migrations.ts`, `sessionStore.ts`, `index.ts` + testes) e `services/sqlErrors.ts` para `packages/db` como `@vetor-wallet/db`. `package.json` com `main: src/index.ts`, tsconfig próprio, `vitest`. Atualizar os **33 arquivos** do server que importam `db` por caminho relativo, o `paths` do tsconfig do server e o alias `@vetor-wallet/server/db` usado por `cli/src/grantAdmin.ts` e `cli/src/hourlyInsights.ts`.
- **Fora de escopo**: qualquer mudança de SQL, schema ou comportamento; renomear o package `server`.
- **Critério de aceite**: `pnpm --filter vetor-wallet-server test` e `pnpm --filter vetor-wallet-web test` verdes com a **mesma contagem** de testes; `pnpm build` gera `dist/api/index.js`; `pnpm --filter vetor-wallet-cli insights:hourly` roda. **Atenção**: `client.ts` lê `DATABASE_URL` no top-level — a convenção "setar env antes do `await import()`" continua valendo, agora com `await import('@vetor-wallet/db')`.

### T-098 — Extrair as integrações: `brapi-core` e `abacatepay-core`
- **Status**: PENDENTE
- **Prioridade**: P1
- **Complexidade**: média
- **Depende de**: T-097
- **Branch/worktree**:
- **Contexto**: são os candidatos mais limpos — `quotes.ts`, `tickers.ts` e `abacatepay.ts` já são clients HTTP puros, sem nenhum import de `db`. Extrair primeiro valida o formato de package core com risco quase zero.
- **Escopo**: `packages/brapi-core` (de `services/quotes.ts` + `tickers.ts`) e `packages/abacatepay-core` (de `services/abacatepay.ts`), cada um com testes ao lado e um `CLAUDE.md` próprio com as invariantes que hoje vivem no cabeçalho dos arquivos (envelope `{data,error,success}` com HTTP 200 + `error`; timeout 10s do Pix × 5s da cotação; cotação degrada em silêncio, cobrança nunca).
- **Fora de escopo**: mexer em `billing.ts` (fica para a T-099); mudar timeout, retry ou tratamento de erro.
- **Critério de aceite**: nenhum dos dois packages importa `@vetor-wallet/db` nem `express` (verificável por grep); suítes verdes com a mesma contagem; `BRAPI_TOKEN`/`ABACATEPAY_*` continuam lidos do env do processo.

### T-099 — Extrair os core de domínio
- **Status**: PENDENTE
- **Prioridade**: P1
- **Complexidade**: alta
- **Depende de**: T-098
- **Branch/worktree**:
- **Contexto**: o grosso da migração. Estes core **podem** falar com `db` (são donos do dado) — ver a definição de "Core" em `PACKAGES.md`.
- **Escopo**: criar, nesta ordem e **um commit por package** dentro do mesmo PR: `validation-core` (`dates.ts`, `money.ts` — transversal, vem primeiro porque os outros usam), `billing-core` (`billing.ts`), `savings-core` (`savings.ts`, `goals.ts`), `expenses-core` (`categories.ts`, `recurringExpenses.ts`), `bank-import-core` (`ofx.ts`, `externalId.ts`), `insights-core` (`benchmarks.ts`, `benchmarkHistory.ts`, `hourlyInsights.ts`), `portfolio-core` (`portfolio.ts`, `portfolioHistory.ts`, `wallets.ts`, `snapshots.ts`, `snapshotScheduler.ts`), `auth-core` (`api/auth/service.ts`). Cada um leva seus testes e ganha um `CLAUDE.md` migrado do arquivo correspondente em `docs/decisions/` (que passa a ser um stub apontando para o package).
- **Fora de escopo**: `api/auth/middleware.ts` e `api/middleware/*` ficam no server (são Express); as rotas não mudam de lugar; nenhuma regra de negócio muda.
- **Critério de aceite**: nenhum `*-core` importa `express` (grep); suítes verdes com a mesma contagem; `docs/MODULES.md` e `docs/PACKAGES.md` atualizados removendo o marcador *(planejado)* de cada package criado.

### T-100 — Renomear `server` → `rest-api`
- **Status**: PENDENTE
- **Prioridade**: P3
- **Complexidade**: média
- **Depende de**: T-099
- **Branch/worktree**:
- **Contexto**: fechamento cosmético do alvo. **P3 de propósito**: é churn puro e toca deploy — só fazer com as ondas paradas e o humano ciente de que o entry de produção muda.
- **Escopo**: renomear o diretório e o package (`vetor-wallet-server` → `vetor-wallet-rest-api`), atualizar scripts da raiz (`dev:server`, `build`, `test`, `lint`, `format`), o alias `@vetor-wallet/server/*` do `cli/tsconfig.json`, o entry `dist/api/index.js` e toda menção em `CLAUDE.md`, `docs/decisions/` e `docs/multi-agent/`.
- **Fora de escopo**: mover arquivos dentro do package.
- **Critério de aceite**: `pnpm dev`, `pnpm build`, `pnpm test` funcionam da raiz; nenhuma ocorrência de `vetor-wallet-server` ou `@vetor-wallet/server` sobra no repo (grep); humano avisado sobre o novo caminho do entry no deploy.

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes)

> As colheitas dos ciclos 9 e 10 foram resolvidas pelas tarefas T-051–T-055 (Ciclo 10). Abaixo, só o que segue aberto.

- Comparação com CDI/Ibovespa em outros pontos (simulador da poupança, projeções de aporte, card resumo) — o humano aprovou a opção do gráfico de evolução (T-068); as demais ficam como extensão futura.
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
- `current_amount` manual obsoleto ao desvincular o último lançamento de uma meta (semântica a decidir).
- Threshold percentual de 2 casas a revisitar com a UI de alertas (demais sobras das revisões 10–11 entraram no Ciclo 14: T-064–T-067).
- Backfill histórico de snapshots via `hourly_quote_insights` (o agendador in-process foi entregue na T-061; Lambda/EventBridge segue como dívida de produção).
- Ampliar `/admin`; backend de cripto (aguardando o humano); agendador do job de insights (Lambda/EventBridge); redesign de Alertas/Import (hoje sem UI).
- **Dos ciclos 17–18 (2026-08-05)**: limpar backend de budgets (rotas + tabela `category_budgets` + tipo no shared) — a UI foi removida na T-089 e nada mais consome; datar `buildIbovespaSeries` em BRT em vez de UTC (consistência com a âncora da rota; hoje um candle intraday após 21h BRT pode ser datado como "amanhã" e recortado — achado da T-095).
- **Da revisão de 2026-08-02** (não viraram tarefa do ciclo 16): padronizar casing da API (goals usa `target_amount`, operations usa camelCase — só dói para integradores); default silencioso `type: 'OUTRO'` no POST /api/income; "caixa de entrada" de revisão para transações importadas (confirmar/categorizar antes de virar lançamento — extratos reais têm estornos e transferências entre contas próprias); endpoint `investments` da Pluggy para reconciliar posição B3.

## Ciclos concluídos (detalhes no [`BACKLOG-ARQUIVO.md`](./BACKLOG-ARQUIVO.md))

| Ciclo | Tema | Tarefas | PRs | Suíte ao fim |
|---|---|---|---|---|
| 1 | Paleta 60-30-10 + responsividade | T-001, T-002 | #44, #45 | — |
| 2 | Refactor "Vetor Wallet v4" multi-layer | T-003 a T-013 | #47–#56 | 128 testes |
| 3 | Robustez e dívidas técnicas | T-014, T-015, T-017, T-018 | #57–#60 | 132+13 |
| 4 (Onda A) | SELL do CSV por wallet + P&L diário | T-019, T-016 | #61, #62 | 147+19 |
| 5 | Layers básicos (Mobills/Organizze/Wallet) | T-022 a T-027 | #63–#68 | 190+63 |
| 6 | Colheita das revisões + edição inline + Onda C | T-028 a T-035 | #69–#76 | 342+113 |
| 7 | Feedback do humano: renda variável, ocultar orçamento, logo clicável (+ arrumação docs/repo) | T-036 a T-038 | #77–#79 | 370+122 |
| 8 | Pedidos do humano pré-onda: landing c/ Despesas, simulador de rendimento, transferência poupança→meta, labels de renda | T-039 a T-042 | #80–#83 | 411+171 |
| 9 | Colheita das revisões (5–8) + endurecimento (datas, transação, sessões, user_id) + carteira única | T-043 a T-050b | #84–#92 | 460+177 |
| 10 | Colheita do ciclo 9 + rigor monetário + dash de ações (projeção de ganhos, gráfico SVG, alocação) | T-051 a T-057c | #93–#102 | 489+250 |
| 11 | Histórico real da carteira (coleta no boot + /portfolio/history + gráfico de evolução) + colheita do ciclo 10 | T-058a/b, T-059 | #103–#105 | 532+263 |
| 12 | Preço por ação ao longo do tempo (seletor de ticker + referência do preço médio) | T-060 | #106 | 532+283 |
| 13 | Agendador in-process da coleta de snapshots + aporte mensal nas projeções + colheita da T-058a | T-061 a T-063 | #107–#109 | 537+309 |
| 14 | Colheita (índice, sobras server, charts) + tooltips + benchmarks CDI/IBOV no gráfico | T-064 a T-068 | #110–#114 | 565+351 |
| 15 | Monetização: AbacatePay (Pix), planos, gating por assinatura, staging sem pagamento | T-069 a T-073 | #115–#119 | 650+373 |
