# Guia do orquestrador (Fable)

Leitura inicial obrigatória da sessão orquestradora. Objetivo: em ~2 minutos de leitura, entender o que é o app, onde ele está e o que importa agora.

## O que é o Vetor Wallet

Carteira financeira pessoal para um único usuário real (Giovane), organizada em **layers**: Renda mensal, Despesas (fixas + lançamentos variáveis com recorrência e histórico mensal), Poupança/Reserva (com metas alimentadas por aportes), Metas, Criptomoedas (mock "em breve") e Ações da B3 (posições por preço médio ponderado, cotações em tempo real via brapi.dev, modo carteira única).

- **Arquitetura, schema, rotas, comandos e convenções**: leia `CLAUDE.md` na raiz — é a fonte de verdade técnica. Não duplique aquele conteúdo aqui.
- **Monorepo pnpm**: `shared` (tipos, types-only), `server` (Express + libsql, SQL puro), `web` (Vite + React), `cli` (job de insights horários).
- **Testes**: Vitest no `server` e no `web` (funções puras, ambiente node). Contagem atual da suíte: ver "Estado atual" abaixo (evita número duplicado desatualizando aqui).

## Estado atual (2026-07-25, fim do ciclo 8)

- Ciclos 1–8 concluídos e mergeados (PRs #44–#83) — resumo por ciclo no `BACKLOG.md`, detalhes no `BACKLOG-ARQUIVO.md`. Suíte: 411 server + 171 web.
- Ciclo 8 (pedidos diretos do humano, pré-"próxima onda"): Despesas na landing, simulador de previsão de rendimento em `/poupanca`, transferência poupança→meta com conceito de "saldo livre" (`POST /api/savings/transfer-to-goal`), labels de `/renda` renomeadas.
- **Modo auto ativo** (autorização permanente do humano, 2026-07-24): após APROVADA do revisor, o orquestrador abre PR e faz merge automático, resolvendo conflitos; revisão humana a posteriori. Decisões de produto/UX continuam indo ao `TODO-HUMANO.md`.
- Dívidas de produção restantes: agendador do job de insights (Lambda/EventBridge); Alertas/Import CSV sem UI (aguardando redesign). Sessões já persistem no SQLite (T-034).
- Direções dadas pelo humano: melhorar funções básicas antes de cripto/ações; sem gráficos no dashboard/home; carteira única como fluxo padrão.

## Prioridade vigente

**Aguardando a "próxima onda" anunciada pelo humano** (ciclo 8 encerrou os pedidos pré-onda). Enquanto isso: candidatas listadas no `BACKLOG.md` (inclui colheita das revisões T-040/T-041) + decisões paradas no `TODO-HUMANO.md` (T-020/T-021).

> Atualize esta seção a cada ciclo. Mudança de prioridade que envolva produto → `TODO-HUMANO.md`.

## Como operar

1. Leia `README.md` (fluxo e roteamento de modelos), este arquivo, `CLAUDE.md` e o `BACKLOG.md` atual.
2. Decomponha a prioridade vigente em tarefas de **até ~1h de trabalho de um executor**, cada uma com critério de aceite verificável e **campo Complexidade** (baixa/média/alta), e registre no `BACKLOG.md`.
3. Para tarefas de complexidade **alta**, considere um spike de design primeiro: agente `Plan` com `model: "opus"`; o plano resultante entra na íntegra no prompt do executor.
4. Delegue com a ferramenta Agent, subagente `executor`, `isolation: "worktree"`, uma tarefa por agente, com o `model` definido pelo roteamento do `README.md` (alta → `opus`; média → `sonnet`; baixa → `haiku`/`sonnet`). Paralelize apenas tarefas independentes (sem arquivos em comum).
5. No prompt de cada executor inclua: o item do backlog na íntegra, os arquivos-alvo prováveis, o plano do spike (se houver), o estado relevante da `main` (tarefas recém-mergeadas que ele deve respeitar), e a instrução de ler `docs/multi-agent/README.md` e `CLAUDE.md` antes de codar.
6. Ao receber o retorno, spawn do `revisor` sobre o diff — `model: "opus"` quando a tarefa é alta, foi executada em Opus, ou toca dinheiro/auth/schema/migração. Reprovado → devolve ao executor com o feedback (via SendMessage, mesmo worktree); **2 reprovações seguidas → re-delegue com executor `opus` incluindo o histórico dos achados**. Aprovado → integre.
7. Integração: merge da `main` na branch se ela avançou (three-dot no diff do revisor; conferir marcadores de conflito após resolução manual — `git diff --check`), sanidade no worktree (suítes + build), PR via `gh` com `--body-file` (evita quoting do PowerShell), merge, sanidade na `main` ao fim da onda. Registre modelos usados e sugestões do revisor no `BACKLOG.md`.
8. Ao encerrar o ciclo: mova os detalhes das tarefas concluídas para o `BACKLOG-ARQUIVO.md` (uma linha de resumo por ciclo fica no `BACKLOG.md`), atualize este arquivo e reporte ao humano o consolidado.

## Lições operacionais acumuladas

- Executores NÃO deixam servidores dev rodando (porta 3001 livre ao terminar) — incidentes de `EADDRINUSE` nos ciclos 3 e 6.
- Worktrees novos precisam de `pnpm install --frozen-lockfile` antes de testar; rodar testes com `cd` explícito no worktree (executor da T-025 rodou no checkout principal por engano).
- Corpo de PR sempre via `--body-file` (aspas duplas quebram o quoting nativo do PowerShell 5.1).
- Após resolução manual de conflito, conferir marcadores residuais (incidente do orquestrador na T-024, pego pelo revisor da T-023).
- Suítes de teste com datas: ancorar em datas relativas (`currentMonth()`/shift), nunca fixas — testes da T-035 "envelheciam".

## Limites do orquestrador

- Não implementa tarefas grandes diretamente — decompõe e delega. Correções triviais (typo, ajuste de doc, higiene de repo) pode fazer inline.
- Não decide produto: mudanças de escopo, UX ou prioridade vão para o `TODO-HUMANO.md`.
- Merge e PR: autorização permanente concedida pelo humano em 2026-07-24 (modo auto — ver "Estado atual").
