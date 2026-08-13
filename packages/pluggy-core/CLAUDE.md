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
├── pluggySend.ts              # POST/DELETE autenticado; 204 → null (T-089b)
├── createPluggyConnectToken.ts# POST /connect_token p/ o widget (T-089b)
├── deletePluggyItem.ts        # DELETE /items/{id}; 404 = sucesso (T-089b)
├── isPluggyIntegrationEnabled.ts # gate ENVIRONMENT, fail closed (T-089b)
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
  `PUT` e `DELETE`. Por isso o `itemId` tem de ser **guardado por nós** quando o
  widget o entrega (tabela `pluggy_items`, T-089a; era `PLUGGY_ITEM_ID` até
  então), não descoberto — e um `itemId` errado é o erro mais provável da
  integração.
- `GET /v2/transactions` com **paginação por cursor**: `accountId` (obrigatório),
  `dateFrom`/`dateTo` (`yyyy-mm-dd`), `after` (cursor), `ids`. Envelope
  `{ results, next }`, onde `next` é a querystring pronta do próximo passo e vem
  `null` na última página.
- Transação: `id` (UUID), `date` (**timestamp** ISO 8601, UTC), `description`,
  `descriptionRaw`, `amount` (double, **com sinal**), `type` (`DEBIT`|`CREDIT`),
  `category`, `currencyCode`, `status` (`POSTED`|`PENDING`), `balance`,
  `paymentData`, `creditCardMetadata`.
- **`category` vem preenchida no Meu Pluggy gratuito** (medido em 2026-08-12
  contra a API real; a doc dá a entender que dependeria de plano pago). Os
  valores que interessam ao mapeamento são `Investments`, `Same person transfer`,
  `Credit card payment` e `Transfers`, entre dezenas de outros. Isso importa
  além da categoria do lançamento: é o **único sinal limpo** para distinguir gasto
  real de movimentação interna (aplicação em reserva, transferência para si mesmo,
  pagamento de fatura), que é o objeto da T-088.
- **Sinal de `amount` em cartão (`CREDIT`) é invertido**, e a doc é explícita:
  "positive amounts (+X) indicate debits — new charges that increase the
  outstanding balance"; negativos são pagamentos/estornos. Essa inversão é o
  motivo de o mapeamento receber o tipo da conta (ver `bank-import-core/CLAUDE.md`).
- **`POST /connect_token`** recebe `{ options: { clientUserId?, webhookUrl?,
  oauthRedirectUri?, avoidDuplicates? } }` e responde `{ accessToken }` (JWT de
  ~30 min). É o token que inicializa o widget — ver "Como obter um `itemId` novo".

Assumido (não achamos na doc, e o código trata os dois lados):

- Que em conta (`BANK`) o sinal é o **natural** — entrada positiva, saída
  negativa. A doc **não** afirma isso textualmente (só afirma a inversão do
  cartão): é convenção contábil padrão. Ressalva levantada pelo revisor da T-087
  e **confirmada contra a API real** em 2026-08-12 — numa conta corrente ligada,
  todos os débitos vieram negativos e todos os créditos positivos.
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

## Como obter um `itemId` novo (procedimento, feito em 2026-08-12)

Não existe endpoint de listar items, então quando o humano conectar **outro banco**
no Meu Pluggy será preciso capturar o `itemId` de novo. O caminho medido e que
funcionou:

1. **Minerar o `connect_token` no servidor** — `POST /connect_token` com a apiKey.
   O `clientSecret` **nunca** vai para o browser; o widget recebe só o token de
   ~30 min. A doc oficial mostra o mesmo padrão com o `pluggy-sdk`
   (`pluggy.createConnectToken({ clientUserId })` numa route handler), e é a
   regra que o humano reafirmou: **token se cria no servidor, nunca na web.**
2. **Abrir o widget** com esse token:
   `<script src="https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js">`,
   depois `new PluggyConnect({ connectToken, connectorIds: [200], onSuccess })`.
   O `onSuccess` entrega o item — daí sai o `PLUGGY_ITEM_ID`.
3. **Repetir uma vez por instituição**: o conector 200 (`MeuPluggy`, `oauth=true`)
   cria **um item por banco** ligado na conta consumidor.

Duas pedras no caminho, as duas medidas contra a API real:

- **`options.oauthRedirectUri` recusa `localhost`** — exige HTTPS ou deep link
  (400 `must be a valid HTTPS URL (not localhost)`). Sem callback local possível;
  omita o campo e deixe o SDK conduzir o retorno do OAuth.
- **`GET /items` responde 401**, não 404 — parece problema de credencial, mas o
  endpoint simplesmente não existe.

**Não usamos o `pluggy-sdk`** (nem aqui, nem no helper): a convenção do projeto é
client à mão com `fetch` nativo e zero dependência, como no `brapi-core`. O SDK é
uma alternativa legítima e a doc oficial o usa nos exemplos — a escolha é de
convenção, não de capacidade.

## Variáveis de ambiente

`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` (obrigatórias),
`PLUGGY_API_URL` (opcional, default `https://api.pluggy.ai`). O `itemId` **não é
mais env**: desde a T-089a ele vive em `pluggy_items`, por usuário, e chega a
`fetchPluggyAccounts` como argumento (`PLUGGY_ITEM_ID` sobrou só como bootstrap
do comando `pluggy:link`). O `PLUGGY_USER_EMAIL` é default do **CLI**, não deste
package — ver `packages/cli/.env.example`. Valores reais vivem só no `.env` local (git-ignored)
e são preenchidos pelo humano.

## Roadmap: webhooks (não implementado — depende de deploy)

A Pluggy notifica por webhook os eventos de item — `item/created`, `item/updated`,
`item/error` — com `{ event, eventId, itemId, error? }`. Isso resolveria duas
coisas que hoje são manuais: **descobrir o `itemId`** (chega no `item/created`, sem
widget nem configuração) e **saber quando sincronizar** (hoje o job roda por
janela de 30 dias, sem saber se há dado novo).

Está fora de escopo por um bloqueio real, não por decisão: **não há deploy** (ver
`TODO-HUMANO.md`) e webhook exige URL **HTTPS pública** — o mesmo motivo que
impede o `oauthRedirectUri` local. Quando entrar:

- **Responder 2XX em até 5 segundos** (exigência da Pluggy). Ou seja: enfileirar/
  responder primeiro, processar depois — não sincronizar dentro do handler.
- O precedente do repo é o **webhook da AbacatePay**: rota sem sessão, `express.raw`
  montado **antes** do `express.json()` global, e verificação de assinatura. Confirmar
  na doc como a Pluggy autentica a chamada — sem isso, qualquer um posta `item/created`.
- `webhookUrl` pode ir por item, em `options` do `POST /connect_token`.

## Escrita na Pluggy e o gate de ambiente (T-089b)

Até a T-089a este package só **lia**. A integração dentro do app precisou de três
peças novas:

- **`pluggySend`** — `POST`/`DELETE` autenticado, irmão separado do `pluggyGet`
  de propósito: leitura é idempotente e pode ser repetida, escrita não. Os dois
  no mesmo lugar convidariam um retry de leitura a escorregar para cima de um
  `POST /items` e criar uma segunda conexão bancária. `204` devolve `null` (é a
  resposta normal do `DELETE`, e `res.json()` num corpo vazio explodiria).
- **`createPluggyConnectToken`** — o `clientSecret` **nunca** vai para o browser:
  ele lê o extrato de *todos* os items da aplicação. O servidor o troca por um
  token de ~30 min e é o token que desce. **A forma do corpo é `{ itemId?,
  options: { clientUserId } }`** — `clientUserId` na raiz não dá erro, a Pluggy
  ignora o campo desconhecido e emite um token sem dono (falha silenciosa: o
  widget funciona e o item só não aparece atribuído no painel). Com `itemId` o
  widget abre em **reautenticação** daquela conexão; sem ele, cria uma nova — e
  sem essa distinção, renovar senha viraria um segundo item para o mesmo banco,
  que reimportaria tudo.
- **`deletePluggyItem`** — fecha a pendência da T-089a (lá só apagávamos a nossa
  linha). **404 conta como sucesso**: o item já não existe lá, o desfecho pedido
  está satisfeito, e virar erro deixaria a linha órfã no nosso banco sem saída
  pela UI. Mesma doutrina do dedupe da T-084 — o que importa é o estado final.

**`isPluggyIntegrationEnabled`** é o gate `ENVIRONMENT` (decisão do humano,
2026-08-12): só `Staging` libera, **fail closed** em ausente/vazia/desconhecida.
É o oposto deliberado do fail *open* da T-088: lá errar fechado sumiria com
despesa real, aqui errar aberto oferece a integração a terceiros sem contrato com
a Pluggy — custo jurídico que não aparece em tela nenhuma. `ENVIRONMENT` é a
**única autoridade** para este gate e pode divergir de `NODE_ENV`, de propósito
(o staging do dono do app roda com `NODE_ENV=production`).

Quem traduz isso em HTTP é `packages/rest-api/src/api/middleware/requirePluggyEnabled.ts`
— mesmo arranjo de `isBillingEnabled()` × `requireActiveSubscription`.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, `fetch` sempre mockado
  (`vi.stubGlobal`): **nenhum teste bate na API real**.

Ver também `CLAUDE.md` da raiz, `packages/bank-import-core/CLAUDE.md` (mapeamento,
dedupe e o job) e `docs/MODULES.md` (módulo BankImport).
