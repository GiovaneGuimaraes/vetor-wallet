# CLAUDE.md — @vetor-wallet/operations-core

O **CRUD** de `operations` e a leitura de `wallets` — o SQL que ficou nas rotas
`packages/rest-api/src/api/routes/{operations,wallets}.ts` quando a T-099c
extraiu o `portfolio-core`. Categoria **Core**, módulo **Portfolio** (ver
`docs/MODULES.md`/`docs/PACKAGES.md`).

Nasceu na **T-104** (fatia operations/wallets), já no formato-alvo: uma função
por arquivo, **`db` injetado**, Jest com testes em `tests/unit/tests/` e
cobertura **100% travada por `coverageThreshold`**.

## Por que `operations-core`, e não `wallets-core`

O package cobre as duas tabelas, então o nome teve de escolher uma. Escolheu
`operations` porque, desde a T-050 (carteira única), **a operação é a entidade
primária do módulo e a carteira virou rótulo**: nenhuma leitura filtra por
carteira, `walletId` vindo do cliente é ignorado, e `wallets` só existe para
dar nome/cor ao registro. Um `wallets-core` daria o nome do package ao conceito
que o app passou quatro tarefas tirando do caminho.

## Por que um segundo core no módulo Portfolio

`portfolio-core` já é dono das mesmas tabelas e continua sendo: ele tem a
**regra** (preço médio ponderado, validação de SELL, série histórica,
snapshots) e ainda está no formato antigo (arquivo-balaio, `db` importado como
singleton, Vitest). Este package tem só o **acesso a dado** das rotas, no
formato-alvo.

A separação é deliberadamente **temporária**: quando o `portfolio-core` migrar
de formato (tarefa própria da T-104), fundir os dois — ou dissolver este dentro
dele — é decisão daquela tarefa. Fazer as duas coisas numa PR só significaria
mexer no cálculo financeiro mais sensível do app no mesmo diff que move SQL de
lugar, e é exatamente o tipo de mistura que o `README.md` do multi-agente manda
evitar.

Consequência prática ao mexer aqui: **regra nova de domínio não entra neste
package**. Se a função precisa de `applyOperation`/`buildPositionMap`, ela
pertence ao `portfolio-core`.

## Invariantes (não quebrar)

- **Toda consulta filtra por `user_id`** — inclusive o re-SELECT depois do
  INSERT (T-059) e o `findWalletById` depois do `getOrCreateDefaultWallet`
  (T-065), não só a checagem. Nem uma corrida entre duas consultas pode ler ou
  escrever em linha alheia.
- **Nenhum filtro de carteira em lugar nenhum** (T-050): o escopo é o usuário,
  e a lista/posição é sempre o consolidado — inclusive sobre carteiras legadas.
  `?walletId=` da rota é ignorado em vez de virar parâmetro aqui.
- **`listOperations` é ordem de EXIBIÇÃO (`DESC`); `listOperationsByTicker` é
  ordem CRONOLÓGICA (`ASC`).** A segunda é contrato, não detalhe: quem a
  consome monta a posição com `applyOperation`, e uma SELL aplicada antes da BUY
  que a cobre distorceria o preço médio.
- **Ausência é `null`/`false`, não exceção.** `deleteOperation` devolve `false`
  e `findWalletById` devolve `null` quando a linha não existe **ou** é de outro
  usuário; a rota traduz os dois no mesmo 404 — distinguir transformaria a rota
  em sonda de existência.
- **Nada aqui normaliza o ticker.** A rota faz `trim().toUpperCase()` porque
  precisa do valor normalizado duas vezes (na checagem de posição e no INSERT);
  duplicar a normalização aqui criaria uma segunda fonte de verdade silenciosa.
- **Não importa `express`** nem nada de `rest-api`/`web` (regra 1 de
  `docs/PACKAGES.md`), e **não importa `portfolio-core`** (ver abaixo).

## Por que a validação de SELL ficou na rota

`POST /api/operations` valida a venda em três passos: lê as operações do ticker
(`listOperationsByTicker`, aqui), monta a posição (`buildPositionMap`) e decide
(`wouldExceedPosition`) — os dois últimos no `portfolio-core`, **puros**. A rota
é quem costura, e é o lugar certo: pela regra 6 de `docs/PACKAGES.md`, quem
cruza dois cores é a rota, não um core.

Houve a alternativa de uma função `exceedsCurrentPosition` aqui, importando o
`portfolio-core`. Foi recusada por um motivo concreto além da regra: o barrel do
`portfolio-core` carrega `snapshots.ts`, que importa o **singleton**
`@vetor-wallet/db` no topo do módulo (até a fatia 2/2 da migração de formato do
`portfolio-core`; `wallets.ts` já saiu na fatia 1) — e esse singleton cria um `data/wallet.db`
no `cwd` quando não há `DATABASE_URL`. A suíte unitária deste package, que existe
justamente para não precisar de banco, passaria a criar um.

## Bug conhecido que esta extração PRESERVOU (T-021)

A validação de SELL compara com a posição de **hoje**, não com a da **data** da
venda: um SELL retroativo é aceito ou recusado pelo consolidado atual. É um bug
real, registrado em `docs/multi-agent/TODO-HUMANO.md` (T-021), e o humano decidiu
deixá-lo parado. A extração moveu o código **sem corrigi-lo**, de propósito —
corrigir aqui esconderia uma mudança de comportamento dentro de um refactor que
promete não mudar nada. Quem for consertar: é escopo da T-021, e o lugar é a
regra (`portfolio-core`), não este package.

## O que NÃO veio para cá

- **`getOrCreateDefaultWallet`, `findDefaultWallet`, `countWallets` e
  `withUserLock`** continuam no `portfolio-core` (um arquivo cada desde a fatia
  1/2 da migração de formato dele, já com `db` injetado). São regra (carteira
  única, adoção de operações órfãs, lock por usuário), não CRUD. Fundir os dois
  packages ficou para depois da fatia 2/2 — ver `packages/portfolio-core/CLAUDE.md`.
- **O INSERT em lote de `POST /api/import`** (CSV) continua na rota: ele usa
  `db.batch` e uma query com `IN (...)` próprios, e pertence ao fluxo de
  importação. Candidato natural à próxima fatia, não a esta.

## Convenções

Formato-alvo (molde do `savings-core`, T-110a/b): **uma função por arquivo**,
**`db` injetado** (nunca importado), testes em `tests/unit/tests/` importando
por `src/...`, **Jest**, cobertura **100%**.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Portfolio) e `packages/portfolio-core/CLAUDE.md` (as
invariantes de domínio de carteira/operações).
