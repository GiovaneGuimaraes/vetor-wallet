# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (regras em `README.md`). Executores reportam no retorno do subagente.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Higiene — regra dura (2026-08-09)

Este arquivo é lido em **toda** sessão do orquestrador: cada caractere é pago repetidamente.
Só **trabalho vivo** entra. Rationale completo e modelo de tarefa: [`README.md`](./README.md).

- **Tarefa concluída sai daqui** — o registro vive na PR mergeada e no git; "como o app é hoje" vive nos `CLAUDE.md` de package e em `docs/decisions/`.
- **Teto de 8 KB** (`pnpm backlog:check`). Estourou = tarefa concluída ou spec inflada.
- **Tarefa viva cabe em ~700 caracteres.** Post-mortem vai para a PR; o que muda roteamento futuro vai para `CALIBRAGEM.md`.
- **Pendência que depende do humano não é backlog** — vai para `TODO-HUMANO.md`.

---

## Fila

> **Retomar aqui (atualizado em 2026-09-22).** A fase 1 da migração está em curso e é a
> prioridade; T-091c/d e T-089e seguem parados atrás dela.
>
> 1. **Medir antes de repetir** — traduzir **um** core de `db` para `query` (`packages/query`,
>    já pronto) e medir o custo real. **`savings-core` é o candidato**: já está no formato e é o
>    menor. Só depois repetir nos outros. Recomendação minha, não decidida pelo humano.
> 2. **Passo 3, o que falta**: operations/wallets, alerts, budgets, expense-entries,
>    portfolio/snapshots — no molde da T-110a/c/d.
> 3. **Passo 4 PROVADO em 2026-09-22**: `db:up` + `db:sync` rodaram contra Postgres 16 real
>    (o humano instalou o Docker). Achou e corrigiu um bug real no caminho — `@Index` de
>    propriedade ignorando `underscored: true` em 7 modelos; detalhe em
>    `packages/postgresdb/CLAUDE.md`. Schema aplicado limpo, suíte/lint/build verdes.
> 4. **Passos 6–8 (VPC, Aurora, Lambdas, carga) seguem parados** por decisão do humano.
>
> **Required status check ligado em 2026-09-22** (`Install · Build · Lint · Test` no `main`,
> ruleset `main protegida`) — não bloqueia mais nada. Decisão aberta: a **3 — sessão** (store em
> Postgres × JWT no gateway), necessária só na fase 2.

### T-113 — Medir o custo real: `savings-core` de `db` para `query`
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: nada (passo 4 provado, `packages/query` pronto)
- **Objetivo**: passo 5 de `plano-migracao-aws.md` — trocar `db` injetado por `query({text, values})` num core só, para medir o custo real antes de repetir nos outros. `savings-core` é o candidato: já está no formato-alvo e é o menor.
- **Aceite**: `savings-core` fala só com `query`; suíte do package e do `rest-api` continuam verdes (mesma contagem); registrar aqui o custo medido (pontos/tempo) antes de decidir se os outros cores entram na fila.

### T-091c/d — Renda Fixa com dado real
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: T-091a (#165) e b1 (#166)
- **Objetivo**: **(c)** posição sem ticker (valor aplicado, vencimento, taxa) — o layer hoje assume ticker da B3 + preço médio + cotação da brapi, e caixinha não tem nenhum dos três; **(d)** endpoint `/investments` da Pluggy para preencher. Em série. "Caixinha é Renda Fixa, irmã de Ações" está decidido — **não reabrir** (#165).
- **Risco de dupla contagem com a T-089e**: o dinheiro da caixinha **saiu** da conta, então saldo + caixinha não se sobrepõem — mas se a Pluggy devolver a caixinha *também* como conta, soma duas vezes. Conferir no payload real antes de somar.
- **Herdado da (a)**: o hub usa o total da carteira B3 como valor de qualquer nó não-"em breve" — mapear valor por `node.key`.
- **Aceite**: carteira B3 com os mesmos números; suítes verdes.

### T-104 — Migrar os `*-core` restantes para o formato-alvo (guarda-chuva)
- **Status**: EM ANDAMENTO (3 de ~8) · **Complexidade**: alta
- **Objetivo**: **1 função por arquivo**, **`db` injetado**, **Jest**, cobertura **100% por threshold** — e, na MESMA PR, tirar o CRUD da rota. É o passo 3 de `plano-migracao-aws.md`; não depende de AWS.
- **Molde**: `packages/savings-core` (T-110a/b). Quem já migrou e o que cada um decidiu: `docs/PACKAGES.md` e o `CLAUDE.md` de cada package.
- **Faltam**: operations/wallets · alerts · budgets · expense-entries · portfolio/snapshots.
- **Aceite (por package)**: cobertura 100%; `build`, `lint`, `format:check` e `pnpm test` verdes; **contagem de testes do `rest-api` preservada** — é ela que prova que o comportamento não mudou.

### T-089e — Patrimônio total com saldo das contas da Pluggy
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: T-089 (#163)
- **Objetivo**: pedido do humano (2026-08-12) — o card de patrimônio da Home deve somar o dinheiro que está **na conta e na poupança do banco**. Hoje é `ações + poupança do app`.
- **Decisão travada**: saldo é **posição**, não lançamento — gravá-lo faria a poupança **contar duas vezes**. Ler e exibir, **nunca gravar** em `savings_entries`. `toPluggyAccount` descarta `balance` hoje (deliberado na T-087) e precisa voltar a trazê-lo.
- **Cuidado**: saldo de cartão (`CREDIT`) é **dívida** — só `BANK` entra. Ver a dupla contagem com caixinhas na T-091.
- **Aceite**: patrimônio soma as contas `BANK` conectadas; sem conexão nada muda; nada novo é gravado; suítes verdes.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Acoplamentos core→core** (regra 6 do `PACKAGES.md`; pré-existentes): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar.
- **Limpar backend de budgets** (rotas + `category_budgets` + tipo no shared): sem UI, nada consome.
- **`buildIbovespaSeries` em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `rest-api/vitest.config.ts` fora do padrão, CI não detecta (T-105).
- **Três origens de mascote no web** (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Movimentação interna no OFX** (T-085/T-088): só `MEMO` livre, sem categoria — adivinhar por descrição é o que a T-085 recusa fazer com dinheiro.
- **Backfill histórico de snapshots**: a fonte que a candidata citava (`hourly_quote_insights`) deixou de ser alimentada na T-109a — a tabela existe e está parada.
- **O `DROP` do dado morto ficou mais barato** (T-112): `users.password_hash` e `hourly_quote_insights` **não existem** nos modelos do `postgresdb`, então a migração já os deixa para trás. O dump antes da carga continua obrigatório — "não criar no destino" não é "não ter tido". Enquanto a migração não acontece, segue valendo o item abaixo.
- **Dado morto no schema, à espera de um `DROP`** (migração destrutiva: tarefa própria, com dump para fora do repo antes): `users.password_hash` desde a T-106 (guarda hash de senha antiga sem serventia) e a tabela `hourly_quote_insights` desde a T-109a (ninguém escreve; ninguém nunca leu). Juntar as duas numa migração só.
- **Webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
