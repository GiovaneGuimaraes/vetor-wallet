# CLAUDE.md — @vetor-wallet/bank-import-core

Trazer lançamentos de fora para dentro do app **sem duplicar**: parser de extrato
OFX (T-085) e a política de dedupe por `external_id` (T-084). Extraído de
`packages/rest-api/src/api/services/ofx.ts` e `externalId.ts` na T-099c (Ciclo 19 —
arquitetura em módulos). Categoria **Core**, módulo **BankImport** (ver
`docs/MODULES.md` / `docs/PACKAGES.md`).

Escreve em `income_entries` e `expense_entries` — tabelas cujas *regras* são do
módulo Expenses/Income — mas o dono da **política de importação** (chave de
origem, unicidade parcial, o que é duplicata) é este package; por isso importa
`@vetor-wallet/db`. "Core" é *dono das regras do domínio*, não *nunca faz I/O*.

As seções T-084/T-085/T-086 abaixo vieram de `packages/expenses-core/CLAUDE.md`
(onde estavam marcadas "Ainda por mover") — lá restou só um ponteiro para cá.

`normalizeCategory`, `isValidIsoDate` e `isValidMoneyAmount` **não** estão aqui:
são de `@vetor-wallet/validation-core` (transversais, T-099a).

## Estrutura

```
src/
├── externalId.ts        # validateExternalId (pura), insertEntryWithExternalId
│                        # (INSERT-first + tradução da violação de unicidade),
│                        # duplicateEntryResponse
├── ofx.ts               # decodeOfx (charset pelo header), parseOfx (scanner
│                        # tag→valor dos dois dialetos), parseOfxDate/Amount,
│                        # ofxExternalId, mapOfxTransaction
├── pluggy.ts            # pluggyExternalId, parsePluggyDate,
│                        # mapPluggyTransaction (sinal × type, PENDING, BRL),
│                        # importPluggyTransactions (relatório + dry-run)
├── internalMovement.ts  # classifyInternalMovement — a lista fechada de
│                        # categorias da Pluggy que NÃO viram lançamento (T-088)
├── PluggyItem.ts        # PluggyItem + toPluggyItem (T-089a)
├── PluggyItemError.ts   # erro tipado (INVALID_ITEM_ID, ITEM_ALREADY_LINKED)
├── linkPluggyItem.ts    # upsert idempotente de um item para um usuário
├── listPluggyItems.ts   # os items de UM usuário (sempre filtrado)
├── unlinkPluggyItem.ts  # remove o vínculo (false = não é seu / não existe)
├── syncPluggyItems.ts   # itera os N items do usuário, isolando falhas;
│                        # recebe o client da Pluggy INJETADO
├── __fixtures__/ofx.ts  # fixtures dos dois dialetos, compartilhadas com o
│                        # teste de rota do server (não é `.test.ts` de propósito)
└── index.ts             # barrel
```

Rota: `packages/rest-api/src/api/routes/importOfx.ts` (`express.raw`, 1 MB).
Job: `packages/cli/src/pluggySync.ts` (`pluggy:sync`), com o client em
`@vetor-wallet/pluggy-core`.
Consumidores do dedupe unitário: `routes/incomeEntries.ts`, `routes/expenseEntries.ts`.
Lógica pura do cliente: `packages/web/src/routes/ofxImportReport.ts`.

### Fixtures compartilhadas com o server

`src/__fixtures__/ofx.ts` é usado por dois testes em packages diferentes: o do
parser aqui e `server/src/api/routes/importOfx.test.ts`. O server o importa como
`@vetor-wallet/bank-import-core/fixtures`, um alias **só de teste** declarado em
`packages/rest-api/vitest.config.ts`. Esse alias precisa vir **antes** do alias do
package base no objeto `resolve.alias`: o alias de string do Vite casa por
prefixo, então `'@vetor-wallet/bank-import-core'` sozinho capturaria o subpath e
resolveria para `.../src/index.ts/fixtures`. As fixtures ficam fora do build
(`exclude` do `tsconfig.json`, junto dos testes) e **não** são reexportadas pelo
`index.ts` — não são API do package.

## Invariantes (não quebrar)

- **A idempotência é do banco, não do código.** INSERT primeiro, traduz a
  violação de unicidade. Um SELECT-antes-do-INSERT é TOCTOU.
- **Duplicata unitária é `409`; duplicata em lote é linha de relatório com `200`.**
- **Sem FITID a transação é rejeitada** — nunca importada com id inventado.
- **Movimentação interna não é despesa nem renda** (T-088) — e `Transfers`, a
  guarda-chuva, **não** é movimentação interna.
- **O sinal de `TRNAMT` decide income × expense**; `TRNTYPE` é ignorado.
- **`DTPOSTED` mantém a data LOCAL do extrato** — o offset é ignorado.
- **É o header OFX que decide o charset**, não o conteúdo.

## Dedupe de importação por `external_id` (T-084)

`expense_entries.external_id` guarda o id da transação no sistema de **origem** (`ofx:<FITID>`, `pluggy:<id>` — a prefixação é convenção dos importadores, **não** validada pela rota); `NULL` = lançamento digitado à mão, a maioria das linhas. A unicidade é um índice **parcial** `(user_id, external_id) WHERE external_id IS NOT NULL` (ver `db-schema.md`): dois usuários podem importar o mesmo FITID, e as linhas manuais ficam fora do índice.

- **A idempotência é do banco, não do código** (mesma decisão da T-035): `POST /api/expense-entries` faz o INSERT primeiro e traduz a violação de unicidade em resposta de duplicata (`insertEntryWithExternalId`, em `src/externalId.ts`). Um SELECT-antes-do-INSERT seria TOCTOU — duas requests paralelas passariam as duas pela checagem e a segunda viraria 500.
- **Duplicata unitária responde `409`** `{ error, duplicate: true, entry }`, com a linha já existente no corpo (dá o `id` sem busca extra). `200` + flag seria ignorável por clientes que fazem append otimista, e `201` mentiria. Convenção para a importação em lote (endpoint de arquivo, T-085): duplicata **não** é 409 — vira uma linha do relatório com `200`.
- **`externalId` é validado** por `validateExternalId` (pura, testada): `undefined`/`null` = ausente; `trim()` antes de gravar/comparar (senão `' FIT-1 '` e `'FIT-1'` seriam chaves diferentes); vazio após trim → `400` (string vazia de importador é bug, e engoli-la desligaria o dedupe); máx. 255 chars (limite de FITID na spec OFX; ids Pluggy são UUIDs); sem restrição de charset nem normalização de caixa.
- **`externalId` + `recurring: true` → `400`**: nenhum importador cria recorrência, e os dois mecanismos de idempotência não se misturam (as ocorrências futuras não teriam id de origem para herdar).
- **O PATCH ignora `externalId`** — é etiqueta de procedência, como `transfer_group` (T-041). Um corpo só com `externalId` responde o `400` de corpo vazio.
- **DELETE libera a chave e a reimportação recria a linha** — assimetria **intencional** com a T-035 (lá o controle vive em tabela própria justamente para não recriar). Aqui reimportar o extrato é o jeito de desfazer uma exclusão acidental.
- O contrato real dos importadores é a **função** `insertEntryWithExternalId`, não a rota: o job de sincronização roda no `cli` e chama direto, sem Express nem gate de assinatura.

## Importação de extrato OFX (T-085)

`POST /api/import/ofx` é o caminho de integração bancária que **não depende de terceiro**: todo banco brasileiro relevante exporta OFX no internet banking. Crédito vira `income_entries`, débito vira `expense_entries`, e o dedupe é o da T-084 (`external_id = ofx:<FITID>`, via `insertEntryWithExternalId` — a rota não reimplementa nada de idempotência). Parser próprio em `src/ofx.ts`, testado com fixtures dos dois dialetos em `src/__fixtures__/ofx.ts` (módulo comum, não `.test.ts`, porque é compartilhado pelo teste do parser e pelo da rota; excluído do build junto dos testes no `tsconfig.json` do pacote).

Decisões travadas:

- **Um scanner de tag→valor lê os dois dialetos.** OFX 1.x é SGML (header `OFXHEADER:100`, folhas **sem** fechamento) e 2.x é XML, mas em ambos os **agregados** (`STMTTRN`) são fechados; cortar o valor no primeiro `<` ou fim de linha basta para os 5 campos que interessam (`FITID`, `DTPOSTED`, `TRNAMT`, `MEMO`/`NAME`, `TRNTYPE`) e dispensa lib nova e árvore. Dentro de um `STMTTRN`, a **primeira** ocorrência de cada tag vence (agregados aninhados repetem nomes). Consequência aceita: o documento não é validado — arquivo sujo com blocos legíveis é importado.
- **Payload é o corpo cru (`express.raw`, `type` curinga, limite 1 MB)**, não `multipart`: o CSV de operações já é corpo de texto, a UI da T-086 manda `fetch(file)` sem `FormData`, e o `Buffer` é o que permite decidir o **charset**. Bancos ainda exportam OFX 1.x em cp1252; decodificar tudo como UTF-8 viraria mojibake **na categoria normalizada**, criando duas categorias para o mesmo estabelecimento. `decodeOfx` lê o header ASCII (`CHARSET:1252`/`ENCODING:USASCII`) e decodifica como `latin1` nesse caso, UTF-8 no resto. cp1252 difere de latin-1 só em 0x80–0x9F (aspas tipográficas) — sem decoder cp1252 no Node, essas posições viram controles invisíveis em vez de acento errado. **É o header que decide**, não o conteúdo (dois testes de rota fixam os dois lados).
- **`DTPOSTED` mantém a data LOCAL do extrato**: usa os 8 primeiros dígitos e **ignora** o offset (`[-3:BRT]`). Converter para UTC moveria uma compra de 31/07 23:00 para 01/08, jogando o gasto no mês seguinte e divergindo do app do banco. A data ainda passa por `isValidIsoDate` (`20260230` é rejeitada).
- **`TRNAMT` aceita ponto ou vírgula decimal, e nunca separador de milhar**: `1.234,56` é ambíguo contra `1.234` e adivinhar em campo de dinheiro é pior que rejeitar a linha com motivo. O valor gravado é o **absoluto** (`isValidMoneyAmount`: máx. 2 casas, teto 1e13) e o **sinal** é o que decide income × expense. `TRNTYPE` é ignorado de propósito — bancos divergem no vocabulário (`DEBIT`, `POS`, `XFER`, `FEE`) e o sinal é mais confiável.
- **Sem FITID a transação é rejeitada, não importada com id inventado**: sem chave não há dedupe, e a transação voltaria duplicada no próximo extrato. Mesmo motivo para rejeitar FITID que estoure 255 chars **com** o prefixo `ofx:`.
- **Categoria = MEMO normalizado (`normalizeCategory`, T-028), fallback `outros`** quando não há MEMO nem NAME. Classificação inteligente está fora de escopo; usar o memo normalizado já faz o mesmo estabelecimento cair numa categoria só. Descrição usa `MEMO ?? NAME ?? 'Lançamento importado (OFX)'`, truncada em 200 chars (as tabelas não têm limite, mas MEMO de banco é verborrágico).
- **A resposta é sempre `200` com relatório por transação** — `OfxImportResult` em `shared/` (`{ imported, duplicated, rejected, transactions[] }`, cada linha com `status: 'imported' | 'duplicated' | 'rejected'`, `fitid`/`date`/`amount`/`description`/`entryType` quando legíveis, `reason` nas rejeitadas e `entryId` da linha gravada ou já existente). Três desfechos, não dois: a **duplicada** existe porque reimportar o mesmo extrato é o caminho normal de uso — é a convenção já registrada na T-084 ("duplicata em lote não é 409"). `400` fica só para o documento inteiro: corpo vazio ou sem tag `<OFX>`. OFX válido **sem** transações responde `200` com relatório vazio (extrato sem movimento é legítimo).
- **Os INSERTs são sequenciais, não em `db.batch`**: cada um precisa VER o anterior para que um FITID repetido **dentro do mesmo arquivo** (banco que repete linha) caia como duplicata em vez de estourar o índice único e derrubar o lote inteiro.
- **`requireActiveSubscription` é obrigatório aqui** — a rota escreve nas mesmas tabelas já gateadas nos routers de income/expense entries; sem o gate, a importação seria o caminho de escrita sem assinatura.
- **Fora de escopo (segue pendente)**: classificação inteligente de categoria, e **transferências entre contas próprias**, que hoje importam como estão — uma transferência da conta para a poupança aparece como despesa numa ponta e renda na outra, inflando os dois lados do mês.

## UI de importação OFX (T-086)

Seção recolhível "Importar extrato (OFX)" em `DespesasPage.tsx`, mesmo padrão `CollapsibleSection` da T-074, posicionada logo depois de "+ Adicionar despesa" e recolhida por padrão — é ação minoritária como o form de criação. O `<input type="file">` fica **sempre montado** (não desmonta entre estados) para ficar re-selecionável; ao final de cada envio o `value` do input é limpo (`ref` dedicado), senão o browser não dispara `onChange` de novo para o mesmo caminho de arquivo, e reimportar o mesmo extrato — o caminho normal de uso do endpoint — exigiria escolher outro arquivo primeiro.

- **Leitura como `ArrayBuffer`, não `file.text()`**: o server decide o charset pelo header OFX (T-085); decodificar no browser antes de mandar corromperia extratos em cp1252. `POST /api/import/ofx` recebe esses bytes crus com `Content-Type: application/octet-stream` — **nunca** `application/json`, senão o `express.json()` global consome o stream e a rota vê corpo vazio (mesma pegadinha documentada na rota).
- **Estados da seção**: ocioso → enviando (input desabilitado) → relatório (contagens + lista por transação) → erro (mensagem do server via `Error.message` ou fallback genérico). Um novo upload a partir de qualquer estado (inclusive erro ou relatório anterior) recomeça o ciclo.
- **Lógica de apresentação em módulo puro testado** (`packages/web/src/routes/ofxImportReport.ts`): `formatOfxCounts` monta o resumo pt-BR omitindo categorias com contagem zero (um reimport 100% duplicado não deveria anunciar "0 importadas"); `groupOfxTransactionsByStatus` agrupa preservando a ordem original de cada grupo e a lista renderiza importadas → duplicadas → rejeitadas (o que precisa de atenção fica visível, mas relatório de reimport — majoritariamente duplicado — não abre com isso no topo); `formatOfxTransactionAmount` deriva o sinal do `entryType` (o payload só traz o valor absoluto); `formatOfxRejectionReason` é passthrough do `reason` do server (já em pt-BR) com fallback para quando ele não vier.
- **Refetch pós-import segue o padrão de dedupe da T-049**: sucesso com `imported > 0` chama `refreshEntries(monthKey, { force: true })` (o `force` ignora o `MonthFetchGuard` — sem ele, um fetch do mês já em voo por outro motivo engoliria a reconciliação) e `refreshHistory()`, porque a importação pode ter escrito em qualquer mês do extrato, não só no exibido.
- **Fora de escopo (segue pendente)**: UI para o CSV de operações de corretora (segue T-026) e uma caixa de entrada de revisão antes de gravar (candidata a tarefa futura — hoje a importação já grava direto, sem etapa de confirmação por transação).

## Sincronização Open Finance via Pluggy (T-087)

`src/pluggy.ts` é a metade "nossa" da integração com a Pluggy: o **client HTTP**
vive em `@vetor-wallet/pluggy-core` (Integração, não toca banco) e o job que
orquestra os dois é `packages/cli/src/pluggySync.ts` (`pnpm --filter
vetor-wallet-cli pluggy:sync [YYYY-MM-DD] [--dry-run]`).

**Nada de idempotência nova**: `external_id = pluggy:<id da transação>` gravado
por `insertEntryWithExternalId` — o mesmo INSERT-primeiro da T-084. O contrato dos
importadores é a **função**, não a rota: o job não passa por Express nem pelo gate
de assinatura (`requireActiveSubscription` protege a rota de OFX; um job local
rodado pelo dono do banco não tem o que gatear).

Decisões travadas:

- **`type` decide income × expense** (`CREDIT` → `income_entries`, `DEBIT` →
  `expense_entries`) e o valor gravado é o **absoluto**. Aqui o `type` é
  confiável, ao contrário do `TRNTYPE` do OFX: é enum de duas opções normalizado
  pelo agregador, não vocabulário livre de cada banco.
- **`type` e o sinal de `amount` são fontes REDUNDANTES da direção; se
  discordarem, a linha é rejeitada** — não escolhemos uma. Mesma doutrina do
  `TRNAMT` com separador de milhar ambíguo (T-085): campo de dinheiro não se
  adivinha. A convenção de sinal **depende do tipo de conta** e está na doc da
  Pluggy: em conta (`BANK`) é natural (`CREDIT` positivo, `DEBIT` negativo); em
  cartão (`CREDIT`) é **invertida** — compra nova (`DEBIT`) vem positiva porque
  aumenta a fatura. Por isso `mapPluggyTransaction` recebe o
  `PluggyAccountKind` (default `BANK`) e o job o deriva de `account.type`.
- **`date` é timestamp ISO 8601: usamos os 10 primeiros caracteres, SEM converter
  timezone**, e validamos com `isValidIsoDate`. Mesma invariante do `DTPOSTED`
  (T-085): converter moveria um lançamento de 31/07 para 30/07 e jogaria o gasto
  no mês errado, divergindo do app do banco.
- **Só `POSTED` é importada; `PENDING` é PULADA** (`skipped`), não rejeitada nem
  importada. É uma armadilha real de idempotência: a pendente muda de valor e
  descrição ao efetivar, mas **mantém o `id`** — importá-la faria a segunda
  passagem cair como *duplicata* e congelaria o valor provisório para sempre.
  Pular agora e importar quando virar `POSTED` é o único desfecho que converge
  (tem teste com as duas passagens).
- **`currencyCode` diferente de `BRL` (ou ausente) é rejeitado.** O app é
  BRL-only (`Intl.NumberFormat` pt-BR/BRL); somar dólar como real corromperia o
  mês em silêncio. Ausente também rejeita — assumir BRL seria adivinhar a moeda.
- **Transação sem `id` é rejeitada**, nunca importada com id inventado (sem chave
  não há dedupe); e id que estoure 255 chars **com** o prefixo `pluggy:` também.
- **Categoria**: `category` da Pluggy quando vier, senão a descrição normalizada,
  senão `outros` — as três via `normalizeCategory` (T-028). A `category` vem do
  enriquecimento (plano Pro) e é determinística por estabelecimento, então é
  informação estritamente melhor que a descrição; sem ela (caso do Meu Pluggy
  gratuito) degradamos exatamente para a regra do OFX. Consequência aceita: um
  histórico que atravesse a mudança de plano pode ter os dois critérios.
  Descrição = `description ?? descriptionRaw ?? 'Lançamento importado (Pluggy)'`,
  truncada em 200 chars.
- **Cinco desfechos no relatório**, não três: `imported`/`duplicated`/`rejected`
  (mesmo vocabulário do OFX), `skipped` (pendente) e `previewed` (só no
  `--dry-run` — é o que a linha *seria*). Chamar o dry-run de `imported` mentiria
  no relatório; chamá-lo de `pending` colidiria com o `PENDING` da Pluggy.
- **`dryRun` corta antes de qualquer chamada ao banco, dentro de
  `importPluggyTransactions`** — a garantia do `--dry-run` vive num lugar só e
  testável, não num `if` do CLI.
- **INSERTs sequenciais, não `db.batch`** — mesma razão do OFX: o id repetido
  dentro do próprio lote precisa cair como duplicata.
- **O tipo de entrada é estrutural** (`RawPluggyTransaction`): este package **não**
  importa `pluggy-core`. O `PluggyTransaction` do client encaixa por forma, e o
  teste monta uma transação sem subir a integração.
- **De quem são os lançamentos**: o `userId` é entrada explícita da função. No
  `cli` ele vem de `--email=` ou, na falta dele, de `PLUGGY_USER_EMAIL` (desde a
  T-089a é **default do CLI**, não mais "o usuário dono de tudo"), resolvido em
  `users.id`. Sem "usuário default" silencioso — sem nenhuma das duas fontes, ou
  com e-mail inexistente, o comando falha.
- **Fora de escopo (segue pendente)**: endpoint `investments`; UI; agendamento;
  caixa de entrada de revisão. **Transferência entre contas próprias e pagamento
  de fatura saíram desta lista na T-088** (seção abaixo).

## Items da Pluggy por usuário (T-089a)

A T-087 entregou o job funcionando com `PLUGGY_ITEM_ID` num `.env`: **uma
instalação, um usuário**. A decisão do humano (2026-08-12) é que a integração
vira produto multi-usuário, então a conexão (o "item" da Pluggy) passou a viver
no banco, em `pluggy_items`, por usuário. Esta é a fase (a) da T-089 — as rotas,
o botão e o gatilho de sync são fases seguintes e **não existem ainda**.

**Por que aqui e não num core novo**: o item só existe para importar extrato, e
o dono da política de importação (módulo BankImport) é este package, que já
escreve no banco. Um `pluggy-items-core` seria um package com uma tabela e nenhum
domínio próprio. E **não** em `pluggy-core`: aquele é Integração e nunca toca o
banco (regra 2 de `docs/PACKAGES.md`).

Decisões travadas:

- **Unicidade GLOBAL de `item_id`**, não `(user_id, item_id)`. O `itemId` é
  **credencial portadora**: quem o tem lê o extrato daquela conexão. Com
  unicidade por usuário, B registraria o `itemId` de A e importaria o extrato de
  A para dentro da própria conta — sem nenhuma constraint para segurar. Global
  transforma isso em violação de unicidade. Rationale completo em
  `docs/decisions/db-schema.md`.
- **`linkPluggyItem` é idempotente pelo BANCO** (doutrina da T-084): um único
  `INSERT … ON CONFLICT(item_id) DO UPDATE … WHERE pluggy_items.user_id =
  excluded.user_id`. Reconexão do mesmo usuário atualiza a linha (o `itemId`
  sobrevive à reautenticação); item de outro usuário não casa no `WHERE`, nada é
  escrito, e o SELECT seguinte — filtrado por `user_id` — não acha linha, virando
  `ITEM_ALREADY_LINKED`. **Sem SELECT-antes-do-INSERT** (TOCTOU).
- **Item de outro usuário é invisível, nunca 403.** A mensagem de
  `ITEM_ALREADY_LINKED` não diz de quem é o item (tem teste), e
  `unlinkPluggyItem` devolve `false` tanto para item inexistente quanto para item
  alheio — os dois casos são indistinguíveis de propósito.
- **`unlinkPluggyItem` só apaga a linha nossa.** Revogar do lado da Pluggy
  (`DELETE /items/{id}`) é chamada de Integração e cabe a quem orquestra (a rota
  da fase (b)) — este core não fala com terceiro. **Segue pendente.**
- **`syncPluggyItems` recebe o client da Pluggy INJETADO** (`deps.fetchAccounts`
  / `deps.fetchTransactions`, formas estruturais como `RawPluggyTransaction`):
  importar `pluggy-core` aqui inverteria Core → Integração e obrigaria a mockar
  `fetch` para testar uma regra que não é de HTTP. O `cli` é quem liga os dois.
- **Falha isolada por item E por conta.** Um item que falha (403, item sem conta)
  não aborta os outros; uma conta que falha não aborta as demais do mesmo item.
  Cada falha é linha do relatório e soma em `failures` — o job sai não-zero
  **depois** de importar tudo que dava.
- **`noItems` é desfecho próprio, não sucesso vazio.** Usuário sem nenhum item
  não é "0 contas importadas, sucesso": é a falha silenciosa mais provável da
  integração, e o CLI responde com a mensagem acionável (rode `pluggy:link`).
  Mesma razão de item existente **sem nenhuma conta** contar como falha.
- **`db` chega injetado** nas funções novas (`linkPluggyItem`, `listPluggyItems`,
  `unlinkPluggyItem`, `syncPluggyItems`) — é o formato-alvo de
  `docs/PACKAGES.md`. Divergência consciente: `importPluggyTransactions` e
  `insertEntryWithExternalId` seguem usando o singleton, e trocar a assinatura
  delas arrastaria as rotas de income/expense entries. Essa unificação é da
  migração deste package (T-104), não desta tarefa. O runner segue Vitest com
  teste ao lado, pela mesma razão.

## Movimentação interna não vira lançamento (T-088)

O dry-run real da T-087 provou que o pipeline funcionava e mesmo assim produzia
um **mês irreconhecível**. Não era bug do importador: é o app não ter o conceito
de **movimentação interna** — dinheiro que sai de um bolso do humano para outro
bolso dele não é despesa nem renda. Três defeitos medidos: aplicação em reserva
virava despesa (era a maior parte do volume de débito do mês), o resgate virava
renda, e o pagamento de fatura contava **duas vezes** (despesa na conta, renda no
cartão). Enquanto isso não foi corrigido, a importação real ficou proibida sem
`--dry-run`.

A decisão do humano (2026-08-12, via chat) foi a opção "não importar": usar a
`category` da Pluggy para pular, sem UI nova. A caixa de entrada de revisão
(aprovar transação por transação) foi considerada e **não** escolhida — segue
como candidata.

Decisões travadas:

- **`internal` é um desfecho próprio no relatório**, ao lado de
  `imported`/`duplicated`/`rejected`/`skipped`/`previewed`. Não é `rejected`
  (que significa "não sei importar e não vai melhorar", a única linha que pede
  atenção de quem lê) nem `skipped` (que significa "importo na próxima
  passagem"). Movimentação interna é a linha mais comum de um extrato real:
  contá-la como rejeição faria todo relatório parecer cheio de erro e treinaria
  o humano a ignorar a contagem que importa.
- **A lista é fechada e vive em `internalMovement.ts`**: `Same person transfer`,
  `Credit card payment`, `Investments`. Comparação por **igualdade normalizada**
  (trim + minúsculas + espaços colapsados), nunca `includes`.
- **`Transfers` está deliberadamente FORA da lista.** É a guarda-chuva da Pluggy
  e cobre transferência para **terceiros** — um PIX pago a alguém é despesa real,
  um PIX recebido é renda real. Pulá-la sumiria com dinheiro de verdade em
  silêncio, que é o oposto do defeito consertado aqui. `includes('transfer')`
  cairia exatamente nessa armadilha; tem teste fixando os dois lados.
- **`Investments` também não é importado**, com motivo próprio. A decisão do
  humano é que ele pertence ao **layer de investimentos** (que ainda não existe —
  generalizar o layer de Ações é tarefa própria, nas Candidatas do backlog).
  Importar como despesa até lá manteria o defeito de maior volume. Como nada é
  gravado, o `external_id` segue **livre**: quando o layer existir, uma nova
  sincronização da mesma janela importa essas linhas sem esbarrar no dedupe
  (tem teste).
- **A checagem vem ANTES da validação de status/moeda/sinal.** Decidido que a
  linha não é dinheiro do mês, validar o resto é moot — e reportá-la como
  `rejected` por sinal incoerente pediria atenção para uma linha correta.
  Consequência deliberada: o desfecho é o **mesmo** com a transação pendente ou
  efetivada, em vez de mudar de `skipped` para `internal` entre duas passagens.
  A transação **sem `id`** continua `rejected` mesmo sendo interna: sem id não há
  linha identificável no relatório, e o defeito de dados vem primeiro.
- **Categoria desconhecida ou ausente é lançamento normal — fail OPEN**, ao
  contrário do gate de assinatura e do `ENVIRONMENT` da Pluggy, que falham
  fechado. A assimetria é deliberada: errar para o lado fechado seria **não
  importar despesa real**, e ausência é invisível para quem confere. Errar para o
  lado aberto importa uma movimentação interna que aparece no relatório e pode
  ser apagada. Consequência aceita: se a Pluggy renomear um rótulo, o defeito
  volta até alguém atualizar a lista.
- **Não usa `normalizeCategory`** (T-028) para casar: aquela função é de
  apresentação e pode mudar por motivo de UI. Amarrar "isto é dinheiro do mês ou
  não" à normalização de exibição faria um ajuste de UI mudar, em silêncio,
  quanto o humano gastou.
- **O OFX segue sem isto** — não tem campo de categoria, só `MEMO` de texto
  livre, e adivinhar por descrição é exatamente o que a T-085 recusa a fazer com
  campo de dinheiro. A pendência da T-085 continua aberta para o caminho OFX.

## Modo `replace` da importação (T-089b)

`wipeUserFinancialEntries` apaga **todas** as linhas de `income_entries`,
`expense_entries` e `savings_entries` de um usuário — manuais, de OFX e da
Pluggy, de qualquer data — para o modo `replace` do botão de importar. Decisão do
humano (2026-08-12), tomada com o risco apresentado e depois de as alternativas
mais estreitas (só as linhas `pluggy:*`; só a janela sincronizada) terem sido
recusadas explicitamente.

- **Os três DELETEs vão num `db.batch` só.** Meio caminho — despesas apagadas e
  rendas não — inventaria um mês negativo, e não há desfazer.
- **A poupança não volta**: a importação escreve renda e despesa, nunca
  `savings_entries` (e movimentação interna nem é importada — T-088). Apagá-la é
  perda líquida, e a UI é obrigada a dizer isso antes de confirmar
  (`replaceWarnings` em `packages/web/src/routes/pluggyImport.ts`).
- **Nada é apagado fora dessas três tabelas.** As tabelas legadas de Metas
  (`goals`, `savings_entries.goal_id`) sobrevivem no schema até a T-091b2 e o
  replace **não** as toca — a linha em `goals` fica, só os lançamentos somem
  (tem teste). O par legado de transferência (T-041, `transfer_group`) some
  inteiro: as duas pontas são linhas de `savings_entries`.
- **Por que aqui, e não no `savings-core`**: a função toca território daquele
  package, mas a alternativa — a rota chamar dois cores em sequência — quebraria
  a atomicidade, que é a propriedade que importa numa operação sem volta. Fica
  junto do resto da política de importação, com a dependência declarada em vez
  de escondida.

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo BankImport), `packages/expenses-core/CLAUDE.md` e
`packages/validation-core/CLAUDE.md`.
