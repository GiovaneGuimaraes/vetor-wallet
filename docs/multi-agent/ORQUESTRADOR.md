# Guia do orquestrador (Fable)

Leitura inicial obrigatória da sessão orquestradora. Objetivo: em ~2 minutos de leitura, entender o que é o app, onde ele está e o que importa agora.

## O que é o Vetor Wallet

Carteira financeira pessoal para um único usuário real (Giovane), organizada em **layers**: Renda mensal, Despesas (fixas + lançamentos variáveis com recorrência e histórico mensal), Poupança/Reserva (com metas alimentadas por aportes), Metas, Criptomoedas (mock "em breve") e Ações da B3 (posições por preço médio ponderado, cotações em tempo real via brapi.dev, modo carteira única).

- **Arquitetura, schema, rotas, comandos e convenções**: leia `CLAUDE.md` na raiz — é a fonte de verdade técnica. Não duplique aquele conteúdo aqui.
- **Monorepo pnpm**: `shared` (tipos, types-only), `rest-api` (Express, só HTTP desde o Ciclo 19), `db`, os `*-core` de domínio, `web` (Vite + React), `cli` (jobs).
- **Testes**: Vitest na maioria; Jest nos packages já migrados para o formato-alvo. Contagem atual: ver "Estado atual" abaixo.

## Estado atual (2026-08-09, Ciclo 20 em curso)

> Máximo de ~3 ciclos aqui. O que o app **é** vive nos `CLAUDE.md` de package e em `docs/decisions/`; o que foi **feito** vive nas PRs e no git. Esta seção é só a orientação de quem chega agora.

- **Onde o app está**: layers de Renda, Despesas, Poupança/Metas e Ações da B3 funcionando; monetização por assinatura (AbacatePay/Pix) com gating; importação de extrato OFX com dedupe; página `/conta`. Suíte na `main`: **rest-api 452 · web 454** + os cores (subscription 131, portfolio 73, validation 36, bank-import 34, savings 30, db 29, insights 23, expenses 18, brapi 16, auth 10). `build`, `lint` e `format:check` verdes.
- **Ciclo 19** entregou a **arquitetura em módulos**: `packages/rest-api/src/api/services/` deixou de existir, toda lógica virou `*-core`, lint/Prettier unificados na raiz e travados no CI.
- **Ciclo 20 em curso**: o formato dos cores mudou para **1 função por arquivo + `db` injetado + testes fora do `src/` + cobertura 100%** (piloto `subscription-core`, generalizado no `validation-core`). **A fila é a T-104b (`savings-core`)** — primeiro core com `db` de verdade.
- **Roteamento econômico vigente** (humano, 2026-07-25): revisor SEMPRE Sonnet; Opus só em executor de tarefa alta e spikes `Plan`; Haiku em complexidade baixa que não toca lógica nem SQL.
- **Modo auto ativo** (humano, 2026-07-24): após APROVADA do revisor, PR + merge automático; revisão humana a posteriori.
- **Dívidas de produção**: não há deploy nenhum (decisão de 2026-08-08 — API só local; AWS no horizonte, sem tarefa). Agendador de snapshots e job de insights são in-process e morrem com o processo. Alertas e import CSV sem UI.
- **Higiene pendente**: dezenas de diretórios órfãos em `.claude/worktrees/` com `node_modules` próprio ocupando disco (o git já não os referencia).

> Atualize a cada ciclo, substituindo — não acumulando. Mudança de prioridade que envolva produto → `TODO-HUMANO.md`.

## Como operar

1. Leia `README.md` (fluxo e roteamento de modelos), este arquivo, `CLAUDE.md` e o `BACKLOG.md` atual.
2. Decomponha a prioridade vigente em tarefas de **até ~1h de trabalho de um executor**, cada uma com critério de aceite verificável e **campo Complexidade** (baixa/média/alta), e registre no `BACKLOG.md`.
3. Para tarefas de complexidade **alta**, considere um spike de design primeiro: agente `Plan` com `model: "opus"`; o plano resultante entra na íntegra no prompt do executor.
4. Delegue com a ferramenta Agent, subagente `executor`, `isolation: "worktree"`, uma tarefa por agente, com o `model` definido pelo roteamento do `README.md` (alta → `opus`; média → `sonnet`; baixa → `haiku`/`sonnet`). Paralelize apenas tarefas independentes (sem arquivos em comum).
5. No prompt de cada executor inclua: o item do backlog na íntegra, os arquivos-alvo prováveis, o plano do spike (se houver), o estado relevante da `main` (tarefas recém-mergeadas que ele deve respeitar), e a instrução de ler `docs/multi-agent/README.md` e `CLAUDE.md` antes de codar.
6. Ao receber o retorno, spawn do `revisor` sobre o diff — `model: "opus"` quando a tarefa é alta, foi executada em Opus, ou toca dinheiro/auth/schema/migração. Reprovado → devolve ao executor com o feedback (via SendMessage, mesmo worktree); **2 reprovações seguidas → re-delegue com executor `opus` incluindo o histórico dos achados**. Aprovado → integre.
7. Integração: merge da `main` na branch se ela avançou (three-dot no diff do revisor; conferir marcadores de conflito após resolução manual — `git diff --check`), sanidade no worktree (suítes + build), PR via `gh` com `--body-file` (evita quoting do PowerShell), merge, sanidade na `main` ao fim da onda. Registre modelos usados e sugestões do revisor no `BACKLOG.md`.
8. Ao concluir uma tarefa: **remova o bloco dela do `BACKLOG.md`** (o registro fica na PR e no git — não migre para outro arquivo), acrescente a `CALIBRAGEM.md` só o que muda decisão futura de roteamento, e rode `pnpm backlog:check`. Ao encerrar o ciclo, atualize o "Estado atual" acima **substituindo** o ciclo mais antigo e reporte o consolidado ao humano.

## Lições operacionais acumuladas

- Executores NÃO deixam servidores dev rodando (porta 3001 livre ao terminar) — incidentes de `EADDRINUSE` nos ciclos 3 e 6.
- Worktrees novos precisam de `pnpm install --frozen-lockfile` antes de testar; rodar testes com `cd` explícito no worktree (executor da T-025 rodou no checkout principal por engano).
- Corpo de PR sempre via `--body-file` (aspas duplas quebram o quoting nativo do PowerShell 5.1).
- **Texto com crases, `$` ou acentos nunca passa por string de shell** — escreva o arquivo com a ferramenta Write e aponte o comando para ele. Um `--body-file` montado dentro de aspas duplas no bash teve **todas** as crases comidas por substituição de comando, e a mensagem foi publicada sem os trechos de código (incidente do fluxograma do `#agentic-system`, 2026-08-10). Mesma classe do item acima.
- Após resolução manual de conflito, conferir marcadores residuais (incidente do orquestrador na T-024, pego pelo revisor da T-023).
- Suítes de teste com datas: ancorar em datas relativas (`currentMonth()`/shift), nunca fixas — testes da T-035 "envelheciam".

## Limites do orquestrador

- Não implementa tarefas grandes diretamente — decompõe e delega. Correções triviais (typo, ajuste de doc, higiene de repo) pode fazer inline.
- Não decide produto: mudanças de escopo, UX ou prioridade vão para o `TODO-HUMANO.md`.
- Merge e PR: autorização permanente concedida pelo humano em 2026-07-24 (modo auto — ver "Estado atual").
