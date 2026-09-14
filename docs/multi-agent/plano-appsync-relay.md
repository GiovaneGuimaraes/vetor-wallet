# Plano — migrar a REST API para GraphQL no AWS AppSync, com Relay no web

> Escrito pelo orquestrador em 2026-09-13, a pedido do humano. **Nada aqui está em execução.**
> É o desenho para decidirmos depois: o que você faz na AWS, o que eu faço no código, em que
> ordem, e o que quebra no caminho. As tarefas só entram no `BACKLOG.md` quando você mandar
> começar.

## 1. O que muda, em uma frase

Hoje o web fala com um Express que roda na sua máquina e lê um arquivo SQLite ao lado dele.
Depois, o web falaria com uma API GraphQL gerenciada pela AWS, que chama funções Lambda, que
leem um banco na nuvem — e o Relay passaria a ser o dono do cache e do carregamento de dados no
frontend, no lugar dos `useEffect` que cada página escreve hoje.

## 2. O que você ganha e o que você perde

**Ganha**

- **Uma requisição por tela.** Hoje a Home dispara 6 chamadas, e o Dashboard tem waterfall real:
  o `App.tsx` precisa resolver `getWallets`/`getPortfolio` antes de o Dashboard poder buscar
  histórico e benchmarks. Com GraphQL a tela declara tudo que precisa e vai uma vez.
- **Tempo real onde hoje há polling.** A `PlanosPage` fica batendo em `GET /api/pix-charges/:id`
  para saber se o Pix caiu. Vira uma subscription: o webhook marca pago, a AppSync empurra para
  a tela.
- **Cache normalizado sem você escrever nada.** O Relay guarda por objeto: mudou a despesa em
  uma tela, toda outra tela que mostra aquela despesa atualiza.
- **Nenhum servidor para manter no ar.** O agendador de snapshots, que hoje morre quando você
  fecha o terminal, vira EventBridge.
- **O casing inconsistente morre por construção.** O schema GraphQL não comporta `external_id`
  ao lado de `externalId` — o débito que está no `BACKLOG.md` sai junto, sem tarefa dedicada.

**Perde**

- **O desenvolvimento offline.** Hoje é `pnpm dev` e pronto, sem internet e sem conta em lugar
  nenhum. A AppSync não tem um emulador local bom; o ciclo passa a ser deploy, ou mocks, ou os
  dois. **Este é o maior custo da migração e não tem solução elegante.**
- **Uma conta de nuvem no caminho do seu app pessoal.** Hoje o pior que acontece é o notebook
  desligar. Depois, uma configuração errada pode custar dinheiro ou te deixar sem acesso.
- **Os tokens do Cognito saem do servidor.** Hoje o access token vive na sessão, no SQLite, e o
  navegador só tem um cookie `sid` opaco. No modelo da AppSync o navegador manda o token do
  Cognito em cada requisição — ele passa a existir no cliente. Ver a decisão 3.
- **Tempo.** É a reescrita do transporte inteiro: 65 endpoints, 57 funções em `api.ts` e 16
  arquivos que as chamam. São meses de tarefas, não um ciclo.

Não estou te desencorajando — o plano abaixo é completo e executável. Só quero a conta na mesa
antes do primeiro `cdk deploy`.

## 3. Decisões que só você pode tomar

### Decisão 1 — para onde vai o banco

O SQLite é um arquivo no seu disco. A AppSync roda na AWS e não alcança esse arquivo. **Migrar
para a AppSync implica migrar o banco**, e essa escolha define o tamanho da obra:

| Opção | O que acontece com o código | Trade-off |
|---|---|---|
| **A. Turso (libsql gerenciado)** | **Quase nada muda.** O `@vetor-wallet/db` já usa `@libsql/client`, e o Turso é o mesmo protocolo. Os `*-core` continuam recebendo `db` e rodando o mesmo SQL. | Não é AWS — mais um fornecedor na conta. Latência de rede onde hoje é leitura de arquivo. |
| **B. Aurora Serverless v2 + RDS Data API** | Reescrever o SQL para Postgres e mexer em todo `*-core`. | Tudo dentro da AWS e resolvers diretos, sem Lambda. Aurora cobra capacidade mínima contínua, não uso — para um app de um usuário é o item caro do mês. |
| **C. DynamoDB** | Reescrita de verdade: o app é relacional (preço médio ponderado, agregação mensal, resumos por categoria). | Mais barato e mais "nativo" na AppSync, mas o modelo de dados briga com o app. |

**Recomendo a A.** É a única em que a lógica de domínio — que acabou de ser migrada para
packages com `db` injetado — atravessa a mudança intacta. A B e a C transformam "trocar o
transporte" em "reescrever o app".

### Decisão 2 — infra as code desde o primeiro dia, ou console primeiro?

**Recomendo: console uma vez, só para ver o que é; CDK para valer.** Um `packages/infra` com
AWS CDK em TypeScript, no mesmo monorepo, versionado. Recurso criado por clique é recurso que
ninguém reproduz seis meses depois — e a T-106 já mostrou como é caçar a caixinha certa no
console do Cognito.

### Decisão 3 — onde ficam os tokens do Cognito

O modelo padrão da AppSync é: o navegador guarda os tokens e manda o `Authorization` em cada
requisição. Isso **muda a postura de segurança de hoje**, em que o token nunca sai do servidor.

- **3a. Padrão AppSync** — tokens no cliente, em memória (nunca `localStorage`), renovados pelo
  SDK. É o caminho que toda a documentação e todo o tooling assumem.
- **3b. Manter um BFF** — um Lambda que guarda a sessão e assina as chamadas, preservando o
  cookie `httpOnly`. Mantém a postura atual e joga fora metade do ganho de simplicidade.

**Recomendo a 3a**, com token só em memória. Mas é decisão sua: o app é o seu dinheiro.

### Decisão 4 — teto de custo

Para um usuário, isso deve custar poucos dólares por mês: a AppSync cobra por milhão de
operações e o Lambda por invocação, e você faz centenas por dia. **Os números exatos mudam e
precisam ser conferidos no dia** — não vou cravar preço aqui. O que recomendo sem depender de
preço: **um AWS Budget com alarme por e-mail antes do primeiro deploy**. Um loop infinito numa
subscription é o tipo de erro que só aparece na fatura.

## 4. Arquitetura alvo

```
     navegador (Vite + React + Relay)
        │  HTTPS, Authorization: <token do Cognito>
        ▼
   ┌───────────────────────────────────┐
   │  AWS AppSync (API GraphQL)        │  authorizer = o SEU user pool (já existe, T-106)
   │  schema.graphql = fonte da verdade│
   └───┬────────────────┬──────────────┘
       │ Lambda         │ subscriptions (WebSocket)
       ▼                ▼
   ┌──────────────────────────┐     "o Pix caiu", "o sync da Pluggy terminou"
   │ Lambda resolvers (Node)  │
   │  = os *-core de hoje,    │───► Turso (libsql)  ← o mesmo SQL de hoje
   │    com `db` injetado     │───► brapi / Pluggy / AbacatePay
   └──────────────────────────┘

   fora do GraphQL, de propósito:
   API Gateway + Lambda ──► webhook da AbacatePay (HMAC sobre os bytes crus)
   S3 presigned + mutation ──► upload de OFX/CSV
   EventBridge + Lambda ──► snapshots de cotação, insights horários
```

O que faz esse desenho valer: **o Lambda resolver é uma casca**. A regra de negócio continua nos
`*-core`, que já recebem `db` por injeção (formato-alvo da T-104). É mais um motivo para aquela
migração de formato valer a pena independentemente desta decisão.

## 5. O que VOCÊ faz na AWS, passo a passo

Cada passo é uma coisa só, na ordem, e dá para parar entre eles.

**Passo 1 — Budget com alarme.** Billing → Budgets → orçamento mensal no valor que você tolera
perder, com alerta por e-mail em 50% e 100%. Antes de qualquer outra coisa.

**Passo 2 — Confirmar a região.** A mesma do user pool (`COGNITO_REGION` no seu `.env`). API em
uma região e pool em outra é retrabalho.

**Passo 3 — Conta no Turso** (se for a opção A) e um banco vazio. Guardar a URL e o token — **no
`.env` local e no Secrets Manager, nunca no repo.**

**Passo 4 — Secrets Manager (ou SSM Parameter Store).** Criar os segredos que os Lambdas vão
ler: token do Turso, `BRAPI_TOKEN`, chaves da AbacatePay e da Pluggy. Hoje eles vivem só no seu
`.env`; na nuvem precisam de um lugar.

**Passo 5 — Criar uma API AppSync pelo console, uma vez, só para olhar.** API GraphQL nova,
authorizer "Amazon Cognito User Pool" apontando para o pool que você já tem, um schema de três
linhas, um resolver de mentira, e uma query no explorador da própria AppSync. Isso te dá o
modelo mental. Depois **apague essa API** — a de verdade nasce do CDK.

**Passo 6 — Permissão de deploy.** No IAM Identity Center que você configurou na T-106, um
permission set que possa criar AppSync, Lambda, roles do IAM e CloudWatch. É com ele que o
`cdk deploy` roda.

**Passo 7 — `cdk bootstrap` na região.** Comando único, cria o bucket de assets do CDK. Eu
preparo o `packages/infra`; esse comando é o único que precisa das suas credenciais.

**Passo 8 — Migrar os dados.** Dump do `wallet.db` e carga no Turso, com conferência de contagem
por tabela. **Com backup fora do repo antes** — e desta vez conferindo que a pasta existe, porque
a de agosto sumiu.

## 6. O que EU faço no código

### 6.1 Packages novos

- **`packages/graphql-schema`** — o `schema.graphql`, **fonte da verdade única**: o CDK publica
  esse arquivo na AppSync e o `relay-compiler` lê o mesmo arquivo para gerar os tipos do web.
  Divergência entre back e front vira erro de compilação, não bug em produção.
- **`packages/infra`** — CDK: a API, o authorizer do Cognito, os Lambdas, as roles, o
  EventBridge, o API Gateway dos webhooks.
- **`packages/resolvers`** — os handlers Lambda. Cada resolver recebe `{ arguments, identity }`,
  chama um `*-core` com o `db` e devolve o objeto. Testável como os cores são hoje, sem subir
  nada.

### 6.2 O schema: três decisões de desenho que o Relay impõe

1. **Interface `Node` e IDs globais.** O Relay identifica objeto por um `id` único **no schema
   inteiro**, e os nossos ids são inteiros por tabela — existe `operations.id = 1` e
   `expense_entries.id = 1`. Todo tipo passa a expor um id opaco (`base64("Operation:1")`), com
   o id do banco escondido atrás dele. Sem isso o cache do Relay mistura objetos diferentes.
2. **Connections onde hoje é array.** `GET /api/operations` devolve tudo do usuário: o
   inventário confirmou que **não existe paginação em lugar nenhum** hoje. O Relay quer
   `edges`/`node`/`pageInfo` com cursor. Proposta: connection de verdade em `operations`,
   `expenseEntries`, `incomeEntries` e `savings` (as listas que crescem para sempre); lista
   simples em `positions`, `benchmarks` e resumos (são cálculo, não coleção).
3. **camelCase em tudo**, com o mapeamento num lugar só, na borda do resolver.

### 6.3 O web, com Relay

- `relay-compiler` como passo de build (`pnpm relay`), o plugin do Relay no Vite, e o
  `RelayEnvironment` com o link de rede que injeta o token do Cognito.
- **Uma query por página**, no topo, e **um fragmento por componente**, declarando o que aquele
  componente lê. É aqui que mora o trabalho de verdade: os 16 arquivos que hoje chamam `api.ts`
  viram fragmentos. **`api.ts` (834 linhas, 57 funções) some no fim.**
- Suspense + ErrorBoundary por página, porque os hooks do Relay suspendem.
- Mutações com `updater`/`@appendEdge` para a lista refletir a criação sem refetch, e optimistic
  update onde a latência incomoda — lançar despesa, principalmente.
- O gate de assinatura (hoje 402 + evento `billing:subscription-required`) vira erro tipado do
  GraphQL com `errorType: SUBSCRIPTION_REQUIRED`, tratado uma vez no link de rede: mesmo
  comportamento de hoje, num lugar só.

### 6.4 Testes

- **Resolver** é função com `db` injetado: teste igual ao dos cores hoje, com banco temporário.
- **Componente Relay** se testa com `createMockEnvironment` + `MockPayloadGenerator` do
  `relay-test-utils`: o componente monta com dados falsos gerados a partir do **schema real**, e
  um campo que o fragmento não pediu quebra o teste. Isso substitui o `vi.mock('../api')` de
  hoje e é estritamente mais forte.
- A política de testes do repo não muda: mudança de comportamento exige teste.

## 7. O que NÃO vai para o GraphQL

- **Webhook da AbacatePay.** Callback de terceiro, com HMAC sobre os bytes crus e ordem de
  middleware que já nos mordeu. Continua REST: API Gateway + Lambda, com o `express.raw` de hoje
  virando um handler que recebe o corpo cru.
- **Upload de OFX e CSV.** GraphQL não é canal de arquivo. Vira URL pré-assinada do S3 + uma
  mutation que recebe a chave do objeto; o Lambda processa e o resultado volta por subscription.
  De bônus, o limite de 1 MB de hoje deixa de existir.
- **Agendador de snapshots e job de insights.** EventBridge + Lambda. Hoje são in-process e
  morrem com o terminal — já estava na lista de dívidas.
- **O gate de ambiente da Pluggy.** `GET /api/pluggy/status` vira campo do schema, mas o gate
  continua sendo variável do Lambda, fail closed, do mesmo jeito.

## 8. Ordem de execução

Incremental, com REST e GraphQL convivendo. **Nunca um big bang** — o app é o seu dinheiro e
tem que continuar funcionando durante a obra.

| Fase | O que entrega | Como eu sei que acabou |
|---|---|---|
| **0. Decisões** | As 4 decisões da seção 3 respondidas; budget criado | Sem isso, nada começa |
| **1. Esqueleto** | `packages/infra` com CDK, API AppSync, authorizer do Cognito, `query { me }` ponta a ponta, Relay montado atrás de flag | Você loga e a tela de Conta lê o `me` pelo GraphQL, com o resto ainda no REST |
| **2. Banco na nuvem** | Turso provisionado, dados migrados, Lambdas lendo de lá | Contagem por tabela bate com o `wallet.db`; o app local continua funcionando contra o SQLite |
| **3. Leitura** | Schema e resolvers de portfolio, renda, despesas, poupança; páginas migradas **uma por PR** | Cada página migrada faz **uma** requisição, e a suíte dela passa com `relay-test-utils` |
| **4. Escrita** | Mutations, connections com `@appendEdge`, optimistic update | Criar/editar/apagar em cada layer sem refetch manual |
| **5. Bordas** | Webhook, upload via S3, EventBridge, subscription do Pix | O polling da `PlanosPage` é deletado |
| **6. Desligar o REST** | `packages/rest-api` sai; `api.ts` sai | `pnpm build` sem o rest-api e nenhuma referência a `localhost:3001` |

Cada fase vira várias tarefas de ~1h no `BACKLOG.md`, no formato de sempre. A fase 3 é a mais
longa e a que fatia melhor: uma página por PR, reversível a qualquer momento.

## 9. Armadilhas que eu já enxergo

- **O `change-password` é o caso mais complicado do auth.** Hoje ele usa o access token guardado
  na sessão do servidor, com refresh automático — e a T-092 já apanhou de um detalhe ali (o
  `SECRET_HASH` do refresh vai sobre o `sub`, não sobre o e-mail). Com o token no cliente, esse
  fluxo muda de lugar. É a primeira coisa a provar na fase 1, não a última.
- **As sessões atuais morrem.** Ao trocar o cookie `sid` pelo token do Cognito, toda sessão ativa
  cai. Para um usuário é um login a mais; só não vire isso em incidente.
- **Cold start no meio de uma cotação.** `GET /api/portfolio` chama a brapi em tempo real; com
  cold start somado, a tela pode ficar visivelmente mais lenta que hoje. Medir antes de otimizar,
  mas já saber que existe.
- **Limite de tamanho e de tempo por resolver.** O import de um extrato OFX gordo é o candidato
  natural a bater nisso — é parte do motivo de ele ir por S3, e não por mutation.
- **`relay-compiler` no CI.** Artefato gerado tem que estar em dia: ou commita o gerado e o CI
  confere, ou gera no build. Escolher e travar no CI — este repo já levou um "verde enganoso"
  esta semana.
- **Migração de dados é destrutiva por natureza.** Dump fora do repo, conferido, antes de
  qualquer carga. A pasta de backup de agosto não existe mais; não repetir.

## 10. O que eu preciso de você para começar

Só as quatro respostas da seção 3 (banco, CDK, tokens, teto de custo) e o passo 1 da seção 5 (o
budget). Com isso eu abro a fase 1 no backlog e a gente vê um `me` atravessando a AppSync antes
de decidir o resto.
