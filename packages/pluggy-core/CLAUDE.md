# CLAUDE.md — @vetor-wallet/pluggy-core

Client HTTP da [Pluggy](https://pluggy.ai) (Open Finance) do Vetor Wallet, criado
na T-087 (Ciclo 20) para o job `pluggy:sync` do `cli`. Categoria **Integração**,
módulo **BankImport** (ver `docs/MODULES.md`/`docs/PACKAGES.md`).

**Nasceu direto como package** (e não como `providers/pluggy/` dentro do
`bank-import-core`) porque era a decisão registrada no roadmap do módulo; a regra
3 de `docs/PACKAGES.md` ("integração de um módulo só vira package quando um
segundo módulo a consome") continua valendo para integrações novas — e há uma
pendência prevista que já mira um segundo consumidor (endpoint `investments`,
para reconciliar posição B3 no módulo Portfolio).

## Fronteira: este package NUNCA toca o banco

Regra 2 de `docs/PACKAGES.md`. Aqui só existe `fetch`: autenticar, listar,
traduzir o payload externo nos nossos tipos e devolver. **Quem decide o que virar
lançamento, com que categoria e em que tabela é o `bank-import-core`**
(`src/pluggy.ts`), e quem grava é `insertEntryWithExternalId` (T-084). Não
importa `@vetor-wallet/db`, `express`, nem qualquer outro `*-core`.

## Estrutura

```
src/
├── PluggyApiError.ts          # erro tipado (com `status` quando veio de resposta)
├── PLUGGY_TIMEOUT_MS.ts       # 15s por request
├── resolvePluggyApiUrl.ts     # PLUGGY_API_URL ?? https://api.pluggy.ai
├── getPluggyApiKey.ts         # POST /auth + cache 2h com margem; _resetPluggyApiKeyCache
├── pluggyGet.ts               # GET autenticado (header X-API-KEY)
├── fetchPluggyAccounts.ts     # GET /accounts?itemId=
├── toPluggyAccount.ts         # payload de conta → PluggyAccount
├── fetchPluggyTransactions.ts # GET /v2/transactions, seguindo o cursor `next`
├── toPluggyTransaction.ts     # payload de transação → PluggyTransaction
└── index.ts                   # barrel
```

Formato **alvo** de package (`docs/PACKAGES.md`): uma função exportada por
arquivo, nome do arquivo = nome da função, `index.ts` só barrel. Duas divergências
conscientes do piloto (`subscription-core`):

- **Runner é Vitest, com teste ao lado do código** (`src/**/*.test.ts`), como no
  `brapi-core` — o package de Integração de referência. Introduzir Jest+Stryker
  aqui só para seguir o piloto acrescentaria config nova sem resolver nada: não há
  `db` para injetar e a única borda a mockar é o `fetch` global, que o Vitest já
  faz com `vi.stubGlobal`.
- **`db` injetado não se aplica** — este package não tem I/O de banco.

## Contrato da API (confirmado × assumido)

Confirmado em https://docs.pluggy.ai (agosto/2026):

- `POST /auth` recebe `{ clientId, clientSecret }` e responde `{ apiKey }` (JWT).
  "This API key expires after **2 hours**". Requests seguintes autenticam pelo
  header **`X-API-KEY`**.
- `GET /accounts?itemId=<uuid>` — `itemId` obrigatório, `type` (`BANK`|`CREDIT`)
  opcional. Envelope `{ results, page, total, totalPages }`. Campos de conta:
  `id`, `type`, `subtype` (`CHECKING_ACCOUNT`|`SAVINGS_ACCOUNT`|`CREDIT_CARD`),
  `number`, `name`, `marketingName`, `balance`, `currencyCode`, `itemId`.
- **Não existe endpoint de listar items**: só `POST /items`, `GET /items/{id}`,
  `PUT` e `DELETE`. Por isso o `itemId` é configuração (`PLUGGY_ITEM_ID`), não
  algo descobrível — e um `itemId` errado é o erro mais provável da integração.
- `GET /v2/transactions` com **paginação por cursor**: `accountId` (obrigatório),
  `dateFrom`/`dateTo` (`yyyy-mm-dd`), `after` (cursor), `ids`. Envelope
  `{ results, next }`, onde `next` é a querystring pronta do próximo passo e vem
  `null` na última página.
- Transação: `id` (UUID), `date` (**timestamp** ISO 8601, UTC), `description`,
  `descriptionRaw`, `amount` (double, **com sinal**), `type` (`DEBIT`|`CREDIT`),
  `category` (vem do enriquecimento, plano Pro), `currencyCode`, `status`
  (`POSTED`|`PENDING`), `balance`, `paymentData`, `creditCardMetadata`.
- **Sinal de `amount`**: em conta (`BANK`) é natural — entrada positiva, saída
  negativa. **Em cartão (`CREDIT`) é invertido**: "positive amounts (+X) indicate
  debits — new charges that increase the outstanding balance", negativos são
  pagamentos/estornos. Essa inversão é o motivo de o mapeamento receber o tipo da
  conta (ver `bank-import-core/CLAUDE.md`).

Assumido (não achamos na doc, e o código trata os dois lados):

- Que `results` sempre vem como array — o código **falha alto** quando não vem,
  em vez de tratar como lista vazia.
- Que um `next` não-nulo sempre é querystring (`?...`) ou path (`/v2/...`);
  qualquer outro formato vira erro explícito.
- Que a Pluggy responde 404/403 para `itemId` inexistente ou de outra aplicação
  (os dois recebem a mesma mensagem acionável).
- O `expiresIn` da apiKey não é devolvido no corpo: as 2h vêm da documentação,
  não da resposta. Daí a margem de segurança.

> **Deprecação relevante**: o endpoint **por página** (`GET /transactions`, com
> `page`/`pageSize`/`totalPages` e `from`/`to`) está deprecado e sai em
> **2026-12-31**. Este package usa a v2 por cursor desde o início — se você achar
> `page`/`totalPages`/`from`/`to` em algum lugar novo, é o endpoint velho.

## Invariantes (não quebrar)

- **Nunca degrada em silêncio.** Rede, timeout, status não-ok, corpo não-JSON e
  envelope sem `results` viram `PluggyApiError`. Ao contrário da cotação da brapi
  (que tem snapshot para cobrir a lacuna), "não consegui listar as transações"
  precisa parar o job: um relatório de "0 lançamentos" é indistinguível de
  "nada novo no banco".
- **Nenhum segredo em mensagem, log ou erro.** `clientSecret` e `apiKey` nunca
  entram em `Error.message`; a falha de autenticação reporta só o status HTTP, e o
  erro de rede é escrito à mão (o erro do `fetch` pode carregar a request no
  `cause`). Não há `console.log` neste package.
- **A apiKey é cacheada por 2h − 5min**, com o `clientId` como parte da entrada
  do cache. Não há retry automático de 401: o job é curto e a margem cobre o
  vencimento; um 401 real (credencial revogada) deve falhar alto, não virar um
  loop de reautenticação.
- **A paginação termina por `next === null`, e só.** Página vazia no meio **não**
  é fim (tem teste); `totalPages` não existe na v2. `MAX_PAGES` (200) é teto
  defensivo: um `next` que nunca zera falha com mensagem em vez de rodar para
  sempre.
- **Nada é inventado na tradução.** Campo ausente/estranho vira `null` —
  inclusive `id`. Rejeitar transação sem id é decisão do `bank-import-core`, e
  inventar um id aqui quebraria o dedupe da T-084.
- **Env lido dentro das funções**, nunca no top-level do módulo (mesmo motivo do
  `BRAPI_TOKEN` no `brapi-core`): permite trocar o env entre casos de teste.

## Variáveis de ambiente

`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` (obrigatórias),
`PLUGGY_API_URL` (opcional, default `https://api.pluggy.ai`). O `PLUGGY_ITEM_ID`
e o `PLUGGY_USER_EMAIL` são do **job**, não deste package — ver
`packages/cli/.env.example`. Valores reais vivem só no `.env` local (git-ignored)
e são preenchidos pelo humano.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, `fetch` sempre mockado
  (`vi.stubGlobal`): **nenhum teste bate na API real**.

Ver também `CLAUDE.md` da raiz, `packages/bank-import-core/CLAUDE.md` (mapeamento,
dedupe e o job) e `docs/MODULES.md` (módulo BankImport).
