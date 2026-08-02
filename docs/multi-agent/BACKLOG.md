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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
- **Prioridade**: P3
- **Complexidade**: baixa
- **Depende de**: T-074, T-075, T-076, T-077, T-078 (evita conflito nas mesmas pages)
- **Branch/worktree**:
- **Contexto**: dentro de um layer, o único caminho de volta à Home é clicar no logo — nada indica isso a um usuário novo.
- **Escopo**: link discreto "← Início" (ou breadcrumb mínimo) no topo das pages de layer (`/renda`, `/despesas`, `/poupanca`, `/metas`, `/dash`, `/cripto`), reutilizável, respeitando o tema.
- **Fora de escopo**: menu global/sidebar.
- **Critério de aceite**: toda page de layer tem o link de volta funcional; testes web verdes.
- **Resultado**:

### Onda C — Importação bancária (OFX primeiro, Pluggy depois)

> Estratégia decidida com o humano (2026-08-02): OFX como fundação sem dependência de terceiros (todos os bancos brasileiros relevantes exportam OFX), Pluggy/Meu Pluggy (Conector 200, gratuito para uso pessoal) como automação por cima do mesmo pipeline. Integração direta com Open Finance/bancos foi descartada (inviável para PF; pesquisa registrada na sessão de 2026-08-02).

### T-084 — `external_id` + importação idempotente em income/expense entries
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Status**: PENDENTE
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
- **Escopo**: job `pluggy:sync` em `packages/cli` (padrão do `insights:hourly`): autentica com `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` (novos no `.env.example` do cli), busca transações das contas conectadas desde o último sync, insere com `external_id` = id da transação Pluggy — crédito → income entry, débito → expense entry, categoria Pluggy mapeada para `normalizeCategory`. Flag `--dry-run` imprime sem gravar. Estado do último sync persistido (tabela pequena ou derivado do max `date` importado — decisão do executor, registrada).
- **Fora de escopo**: endpoint `investments` da Pluggy (candidata para reconciliar posição B3); UI; agendamento (roda manual como o insights).
- **Critério de aceite**: com credenciais de teste/mocks, `pnpm --filter vetor-wallet-cli pluggy:sync -- --dry-run` lista transações sem gravar; execução real é idempotente (2ª rodada não duplica — dedupe T-084); testes das funções de mapeamento; suítes verdes.
- **Resultado**:

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
