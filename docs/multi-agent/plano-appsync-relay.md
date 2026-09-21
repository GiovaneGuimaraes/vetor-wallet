# Plano — migrar a REST API para GraphQL no AWS AppSync, com Relay no web

> Escrito pelo orquestrador em 2026-09-13 e **reescrito em 2026-09-14**, depois de duas coisas:
> o humano escolheu **Aurora Serverless v2 + Postgres** (decisão 1) e apontou o monorepo privado
> da OCA (`oneclickads/monorepo`) como arquitetura de referência — ele já roda exatamente esta
> pilha em produção. **Nada aqui está em execução**; as tarefas só entram no `BACKLOG.md` quando
> o humano mandar começar.

## 0. Duas correções de premissa, antes de tudo

**A AppSync não exige Postgres.** Ela alcança qualquer banco através de um Lambda resolver; o que
ela não alcança é um **arquivo no disco do humano**. Resolvers *diretos* (sem Lambda) existem
só para Aurora via RDS Data API e para DynamoDB — e é por isso que a Aurora aparecia como opção,
nunca como requisito. A escolha por Postgres foi tomada com esse esclarecimento na mesa.

**E o caminho da OCA nem usa resolver direto.** Lá a AppSync chama **um** Lambda com o schema
inteiro (graphql-compose), e esse Lambda fala com o Postgres através de outro Lambda proxy
(`lambda-postgres-query`), que vive na VPC. Ou seja: a justificativa "resolver direto sem Lambda"
da opção Aurora **não se aplica** ao desenho que vamos copiar. O que a Aurora entrega de verdade
aqui é *tudo na mesma conta AWS* e *a mesma pilha que o humano já opera* — que é razão
suficiente, e é a razão honesta a registrar.

## 1. O que muda, em uma frase

Hoje o web fala com um Express que roda na máquina do humano e lê um arquivo SQLite ao lado dele.
Depois, o web falaria com uma API GraphQL gerenciada pela AWS, que chama um Lambda, que lê um
Postgres na nuvem — e o Relay passaria a ser o dono do cache e do carregamento de dados no
frontend, no lugar dos `useEffect` que cada página escreve hoje.

## 2. O que se ganha e o que se perde

**Ganha**

- **Uma requisição por tela.** Hoje a Home dispara 6 chamadas, e o Dashboard tem waterfall real:
  o `App.tsx` precisa resolver `getWallets`/`getPortfolio` antes de o Dashboard poder buscar
  histórico e benchmarks. Com GraphQL a tela declara tudo que precisa e vai uma vez.
- **Tempo real onde hoje há polling.** A `PlanosPage` fica batendo em `GET /api/pix-charges/:id`
  para saber se o Pix caiu. Vira uma subscription.
- **Cache normalizado sem escrever nada.** O Relay guarda por objeto: mudou a despesa em uma
  tela, toda outra tela que mostra aquela despesa atualiza.
- **Nenhum servidor para manter no ar.** O agendador de snapshots, que hoje morre quando o
  terminal fecha, vira EventBridge.
- **O casing inconsistente morre por construção.** O schema não comporta `external_id` ao lado
  de `externalId` — o débito do `BACKLOG.md` sai junto, sem tarefa dedicada.
- **Um banco de verdade.** Isto é novo com a escolha da Aurora: tipo `NUMERIC` para dinheiro,
  `ALTER TABLE ... DROP COLUMN` que existe, `ON CONFLICT` completo, tipos de data reais. Boa
  parte da ginástica do `packages/db` existe só porque o SQLite não tem isso (§5.3).

**Perde**

- **O desenvolvimento offline — em parte, e menos do que eu disse antes.** A AppSync não tem
  emulador local bom, isso continua. Mas com **Postgres** o banco local volta a ser possível:
  `docker compose up postgres` e os `*-core` rodam na máquina, offline, contra o mesmo dialeto.
  Com Turso isso seria um serviço remoto. **É o único ponto em que a escolha da Aurora sai na
  frente da opção que eu havia recomendado** — e é um ponto real.
- **Uma conta de nuvem no caminho de um app pessoal.** Uma configuração errada pode custar
  dinheiro.
- **Custo contínuo.** A Aurora Serverless v2 cobra capacidade mínima **enquanto existe**, não por
  uso. Para um app de um usuário, é o item caro do mês e não cai com o app parado (§8, decisão 4).
- **Os tokens do Cognito saem do servidor** (decisão 3, ainda aberta).
- **Tempo.** É a reescrita do transporte inteiro **mais** a reescrita do SQL: 65 endpoints, 57
  funções em `api.ts`, 16 arquivos que as chamam, e **176 pontos de SQL** (§5.1). São meses de
  tarefas, não um ciclo.

## 3. A arquitetura de referência (o que a OCA já roda)

O monorepo `oneclickads/monorepo` é privado e é do próprio humano. Ele resolve, em produção, o
mesmo problema deste plano. O que dá para copiar, package por package:

| Lá | Aqui viraria | O que faz |
|---|---|---|
| `packages/postgresdb` | `packages/postgresdb` | Dono do schema. Modelos declarativos (`@ttoss/postgresdb`, Sequelize por baixo) e `ttoss-postgresdb sync` para aplicar. Gera até o ERD. |
| `packages/lambda-postgres-query` | idem | Dois Lambdas na VPC (um *read*, um *write*) que proxiam SQL para o Postgres. É a única coisa que abre conexão com o banco. |
| `packages/query` | idem | A função `query({ text, values })` que todo core chama. Enfileira as invocações (`p-queue`, ~100/s) para não estourar o limite de conexões. |
| `packages/graph-api` | idem | O schema GraphQL montado com `graphql-compose` + `@ttoss/appsync-api`, **um** handler Lambda para a AppSync inteira, contexto autenticado, middlewares e guards. |
| `packages/vpc`, `deploy-iam` | idem | Rede e permissões de deploy, versionadas. |
| `packages/app` | `packages/web` | Vite + React + **`react-relay`** + `aws-amplify`/Cognito no cliente. |

Três coisas a herdar que valem mais que o código:

1. **`query` injetado, não importado.** Cada função de core recebe `{ query }` e devolve dados.
   É **o mesmo formato-alvo da T-104** que já está em curso aqui, com `db` no lugar de `query`.
   Um `getUser` de lá é indistinguível, na forma, de um core nosso:

   ```ts
   export const getUser = async (args: { query: Query; cognitoSub: string }) => {
     const { rows } = await args.query<User>({
       text: `SELECT id, email, roles FROM users WHERE cognito_sub = $1`,
       values: [args.cognitoSub],
     });
     return rows[0] || null;
   };
   ```

2. **Autenticação central, ownership por resolver.** O middleware resolve `context.user` a partir
   do `sub` do Cognito **antes** de qualquer resolver, e nenhum resolver re-checa. Mas — e esta é
   a lição cara, que lá custou um incidente de IDOR com 13 resolvers — *autenticado não é
   autorizado*: todo SELECT/UPDATE por id vindo de `args` tem que carregar o `user_id` do
   contexto na cláusula. Aqui isso é a regra "toda rota de dados filtra por `user_id`" do
   `CLAUDE.md`, que **não pode se perder na tradução para resolver**.
3. **Índice único é índice nomeado, nunca `unique: true` na coluna.** Em Sequelize, a constraint
   anônima faz o `sync --alter` empilhar uma cópia a cada execução — lá chegou a 20 cópias do
   mesmo índice em produção. Se adotarmos `@ttoss/postgresdb`, esta regra entra no `CLAUDE.md` do
   package no primeiro dia, não depois.

**O que eu NÃO copiaria direto**: as ARNs, ids de conta e hostnames que aparecem nos READMEs de
lá. Este repo é **público** — nada de identificador de infra real entra aqui, nem da OCA nem
nosso (mesma regra do dado financeiro).

## 4. Arquitetura alvo

```
     navegador (Vite + React + Relay)
        │  HTTPS, Authorization: <idToken do Cognito>
        ▼
   ┌───────────────────────────────────┐
   │  AWS AppSync (API GraphQL)        │  authorizer = o user pool que já existe (T-106)
   │  schema = graph-api               │
   └───┬────────────────┬──────────────┘
       │ 1 Lambda       │ subscriptions (WebSocket)
       ▼                ▼
   ┌──────────────────────────┐     "o Pix caiu", "o sync da Pluggy terminou"
   │ graph-api (Lambda)       │
   │  schemaComposer + guards │───► brapi / Pluggy / AbacatePay  (direto, sem VPC)
   │  resolvers = os *-core   │
   └──────────┬───────────────┘
              │ query({ text, values })
              ▼
   ┌──────────────────────────┐
   │ lambda-postgres-query    │  na VPC, read e write
   └──────────┬───────────────┘
              ▼
       Aurora Serverless v2 (Postgres)

   fora do GraphQL, de propósito:
   API Gateway + Lambda ──► webhook da AbacatePay (HMAC sobre os bytes crus)
   S3 presigned + mutation ──► upload de OFX/CSV
   EventBridge + Lambda ──► snapshots de cotação, insights horários
```

O resolver é uma casca: a regra de negócio continua nos `*-core`. **É por isso que a T-104
(formato com dependência injetada) deixou de ser higiene e virou pré-requisito.**

## 5. A fase 1 é a migração do banco — o tamanho real dela

O humano está certo: isto vem primeiro. Não dá para ter resolver antes de ter onde ler.

### 5.1 O inventário, medido hoje no repo

| Onde | Chamadas `db.execute`/`db.batch` (fora de teste) |
|---|---|
| `rest-api` (19 arquivos de rota) | **70** |
| `db` (schema + migrations + sessionStore) | 59 |
| `bank-import-core` | 13 |
| `auth-core` | 13 |
| `portfolio-core` | 10 |
| `subscription-core` | 5 |
| `expenses-core` | 4 |
| `insights-core` | 2 |
| **total** | **176** |

20 tabelas, `schema.ts` com 486 linhas.

**O achado que muda o plano: 70 das 176 estão nas rotas, não em package.** O `CLAUDE.md` diz que
o `rest-api` "ficou só com Express" desde a T-099c — isso vale para *serviços*, mas o CRUD de
`operations`, `savings`, `budgets`, `income`, `expenses`, `wallets`, `alerts`, `plans`,
`subscriptions` e `import` continua escrito dentro do handler da rota. Esse SQL **não tem para
onde ir**: um resolver do AppSync não pode importar um router do Express. Se ele não for extraído
para `*-core` antes, ele é reescrito **duas vezes** — uma para Postgres e outra para o resolver.

### 5.2 O que a tradução SQLite → Postgres toca, item por item

| Construção (ocorrências) | Vira | Risco |
|---|---|---|
| `?` posicional (todas as 176) | `$1 … $n` | Mecânico, mas silencioso: trocar a ordem não dá erro de compilação. |
| `db.execute({ sql, args })` → `.rows` | `query({ text, values })` → `.rows` | **Quase nada muda na forma.** É o motivo de a facade `db` poder ser reimplementada por cima de `query` e os cores quase não perceberem. |
| `lastInsertRowid` (12) | `INSERT ... RETURNING id` | Cada um é uma linha de lógica, não um find/replace. |
| `INTEGER PRIMARY KEY AUTOINCREMENT` (20) | `GENERATED BY DEFAULT AS IDENTITY` | Só no schema. |
| `REAL` para dinheiro (17 colunas) | `NUMERIC(14,2)` | **Mudança de comportamento, não de sintaxe** — ver §5.3. |
| `INSERT OR IGNORE` (9) | `ON CONFLICT DO NOTHING` | Direto. |
| `PRAGMA table_info` / `foreign_keys` + rebuild de tabela (`migrations.ts`) | `ALTER TABLE ... DROP COLUMN` | **Some.** A dança de criar tabela nova, copiar e trocar existe só porque o SQLite não dropa coluna. |
| `isUniqueViolation` por `SQLITE_CONSTRAINT_UNIQUE` (`sqlErrors.ts`) | SQLSTATE **`23505`** | Se passar despercebido, o dedupe de importação e a corrida de recorrência **param de funcionar em silêncio** e viram 500. Teste primeiro. |
| Datas como TEXT ISO comparadas lexicograficamente | manter `TEXT` na primeira passada | Virar `date`/`timestamptz` é ganho real, mas é outra migração. Não misturar com esta. |
| Banco temporário em arquivo + `DATABASE_URL` antes do `import` (toda a suíte) | `@testcontainers/postgresql` (é o que a OCA usa) | Suíte fica mais lenta e passa a exigir Docker. Decisão a tomar na fase 1, não descobrir no meio. |

### 5.3 A decisão embutida na migração: dinheiro em `REAL`

17 colunas (`amount`, `price`, `quantity`, `threshold`) guardam dinheiro em ponto flutuante hoje.
`subscription-core` já é a exceção — usa **centavos inteiros**, e o `schema.ts` explica por quê.
No Postgres o tipo honesto é `NUMERIC(14,2)`, que não arredonda escondido.

Isso **não é cosmético**: somas que hoje fecham por sorte passam a fechar por construção — ou a
divergir de um valor que o humano vê na tela hoje. Precisa de uma conferência de totais por
tabela, antes e depois, com diferença esperada de zero. Se aparecer diferença, ela já existia.

### 5.4 O passo a passo da fase 1

Cada passo é uma coisa só e dá para parar entre eles. **(H)** = só o humano faz.

1. **(H) Budget com alarme.** Billing → Budgets → orçamento mensal no valor tolerável, alerta por
   e-mail em 50% e 100%. **Antes de criar qualquer recurso** — a Aurora cobra por existir.
2. **(H) Confirmar a região.** A mesma do user pool (`COGNITO_REGION` no `.env`).
3. **Extrair o CRUD das rotas para `*-core`** (eu). ~8 tarefas de ~1h, uma por domínio, no
   formato-alvo da T-104 (`db` injetado, 1 função por arquivo, teste). **Tudo continua SQLite e
   continua REST** — nada de AWS aqui, e o app segue funcionando. Depois deste passo, os 70
   pontos de SQL das rotas viram zero e existe um lugar único para reescrever cada query.
4. **Escrever o `packages/postgresdb`** (eu): as 20 tabelas como modelos declarativos, os índices
   **nomeados**, e o `sync` rodando contra um Postgres em Docker. Ainda sem nuvem.
5. **Trocar a facade `db` por `query`** (eu): `{ text, values }` em vez de `{ sql, args }`,
   `$1` em vez de `?`, `RETURNING id` no lugar de `lastInsertRowid`, `23505` no lugar do código
   do SQLite. A suíte inteira roda contra Postgres em container. **É aqui que os 176 pontos são
   tocados** — e é o passo que mais fatia em PRs pequenas, um package por vez.
6. **Rede e banco na AWS** — agora é código nosso, por causa da decisão 2 (§8.1): `packages/infra`
   com um `ensureX` por recurso (VPC, subnets, security groups, endpoint do Secrets Manager,
   Aurora Serverless v2 com capacidade mínima no menor valor aceitável). Eu escrevo, **(H)** roda
   com as credenciais dele — credencial de deploy nunca passa por mim. Os segredos vão para o
   Secrets Manager e os ids dos recursos para o **SSM Parameter Store**, nunca para o repo.
7. **Deploy do `lambda-postgres-query`** (eu escrevo, humano roda o deploy): os dois Lambdas na
   VPC, read e write, pelo mesmo `ensureX` do passo 6.
8. **(H) Migrar os dados.** Dump do `wallet.db` → carga no Postgres → **conferência de contagem
   por tabela e de soma por coluna de dinheiro**. Com backup fora do repo antes, **conferindo que
   a pasta existe** — a de agosto sumiu (registro no `TODO-HUMANO.md`).

No fim da fase 1 **não existe GraphQL ainda**: existe o app de hoje, REST, rodando contra
Postgres. Isso é de propósito — se algo quebrar, o suspeito é um só.

## 6. As fases seguintes

| Fase | O que entrega | Como sei que acabou |
|---|---|---|
| **1. Banco** (§5) | CRUD extraído, `postgresdb`, `query`, Aurora, dados migrados | O app de hoje, REST, funcionando contra Postgres; contagens e somas batendo |
| **2. Esqueleto GraphQL** | `packages/graph-api`, AppSync, authorizer do Cognito, `query { me }` ponta a ponta, Relay atrás de flag | Login e a tela de Conta lendo `me` pelo GraphQL; o resto ainda REST |
| **3. Leitura** | Schema e resolvers de portfolio, renda, despesas, poupança; páginas migradas **uma por PR** | Cada página migrada faz **uma** requisição, com a suíte passando em `relay-test-utils` |
| **4. Escrita** | Mutations, connections com `@appendEdge`, optimistic update | Criar/editar/apagar em cada layer sem refetch manual |
| **5. Bordas** | Webhook, upload via S3, EventBridge, subscription do Pix | O polling da `PlanosPage` é deletado |
| **6. Desligar o REST** | `packages/rest-api` sai; `api.ts` (834 linhas) sai | `pnpm build` sem o rest-api e nenhuma referência a `localhost:3001` |

### 6.1 O que o Relay impõe no schema

1. **Interface `Node` e IDs globais.** Os ids são inteiros por tabela — existe `operations.id = 1`
   e `expense_entries.id = 1`. Todo tipo expõe um id opaco (`base64("Operation:1")`). Sem isso o
   cache do Relay mistura objetos diferentes.
2. **Connections onde hoje é array.** Não existe paginação em lugar nenhum hoje. Proposta:
   connection de verdade em `operations`, `expenseEntries`, `incomeEntries` e `savings`; lista
   simples em `positions`, `benchmarks` e resumos (são cálculo, não coleção).
3. **camelCase em tudo**, mapeado num lugar só, na borda do resolver. O `query` da OCA tem
   `camelCaseKeys` justamente para isso.

### 6.2 Testes

- **Core/resolver**: função com `query` injetado — o teste de hoje, com Postgres em container.
- **Componente Relay**: `createMockEnvironment` + `MockPayloadGenerator`, que geram dados a
  partir do **schema real**; um campo que o fragmento não pediu quebra o teste. Substitui o
  `vi.mock('../api')` e é estritamente mais forte.
- A política de testes do repo não muda: mudança de comportamento exige teste.

## 7. O que NÃO vai para o GraphQL

- **Webhook da AbacatePay.** HMAC sobre bytes crus e ordem de middleware que já mordeu. Continua
  REST: API Gateway + Lambda.
- **Upload de OFX e CSV.** URL pré-assinada do S3 + mutation com a chave do objeto. De bônus, o
  limite de 1 MB de hoje deixa de existir.
- **Agendador de snapshots e job de insights.** EventBridge + Lambda.
- **O gate de ambiente da Pluggy.** Vira campo do schema, mas o gate continua variável do Lambda,
  fail closed.

## 8. Decisões — estado

- **1 — para onde vai o banco: RESPONDIDA em 2026-09-14.** **Aurora Serverless v2 + Postgres.**
  Registro a ressalva, porque decisão registrada é decisão que não se reabre por esquecimento: é
  a opção que reescreve o SQL dos cores (§5.1) e a que cobra capacidade mínima contínua. O humano
  decidiu com os dois custos na mesa, e com duas razões a favor que a recomendação anterior
  subestimava: **é a pilha que ele já opera** (§3) e **devolve o desenvolvimento local offline**
  via Postgres em Docker (§2).
- **2 — infra as code: RESPONDIDA em 2026-09-20 — scripts em SDK puro da AWS, com o `carlin`
  registrado como migração futura (§8.1).** Eu recomendava `carlin`, por ser a pilha que o humano
  já opera; ele escolheu o SDK **sabendo que é o caminho mais caro**, por um motivo que a
  recomendação não pesava: **quer ver como o deploy funciona por baixo**. Provisionar a AppSync na
  mão é objetivo declarado, não efeito colateral. O desenho da §8.1 existe para que a escolha
  custe aprendizado sem custar um caminho sem volta.
- **3 — onde ficam os tokens do Cognito: ABERTA, com um voto novo.** A OCA usa o padrão AppSync
  (`aws-amplify` no cliente). **Recomendo 3a**, token só em memória. Ponto de atenção que não
  muda: o `change-password` de hoje usa o access token guardado na sessão do servidor.
- **4 — teto de custo: ABERTA, e ficou mais urgente.** Com Turso o custo seguia o uso; com Aurora
  Serverless v2 ele **existe enquanto o cluster existir**. O Budget com alarme deixou de ser
  higiene e virou o passo 1 da fase 1.

### 8.1 Deploy em SDK puro — o desenho, e a porta aberta para o `carlin`

A escolha da decisão 2 é **imperativa**: `packages/infra`, um script por recurso, chamando o
`@aws-sdk/client-*`. Registro aqui o que isso custa, para nenhum custo aparecer como surpresa no
meio da fase 1, e as três regras que mantêm a conta pagável.

**O que o SDK entrega fácil** — e é, não por acaso, a parte que ensina: AppSync
(`CreateGraphqlApi`, `StartSchemaCreation`, `CreateDataSource`, `CreateResolver`), Lambda
(`CreateFunction` + zip), Budget e Secrets Manager. Chamada direta, `Update*` equivalente, nada
escondido. Provisionar a AppSync na mão é o objetivo declarado da decisão.

**Onde dói, e não ensina quase nada em troca:**

1. **VPC** — cerca de dez recursos encadeados (VPC, subnets, route tables e associações, security
   groups e regras, e os **endpoints** para o Secrets Manager, porque Lambda em VPC não tem saída
   para a internet). Cada id alimenta o próximo: o grafo de dependência que o CloudFormation
   resolve sozinho passa a ser código nosso.
2. **Aurora Serverless v2** — `CreateDBCluster` + `CreateDBInstance` + subnet group, e um
   **waiter de ~10 minutos** que o script precisa sobreviver a ser interrompido no meio.
3. **IAM** — role criada não é role assumível no mesmo segundo. O
   `InvalidParameterValueException: The role defined for the function cannot be assumed` é
   consistência eventual, e a saída é retry — que o CloudFormation faria por nós.

**O custo real não é o `create`, é a segunda execução.** Sem CloudFormation não há drift
detection, não há rollback de stack meio criada (a limpeza é manual), não há `delete-stack` (a
remoção exige ordem reversa) e **não há outputs** — os ids dos recursos viram estado nosso.

**As três regras** (a terceira é o que torna a migração futura barata):

1. **Estado no SSM Parameter Store, nunca em arquivo.** Cada script grava o id que criou em
   `/vetor-wallet/<ambiente>/<recurso>` e lê de lá o que precisa. Não é preferência de estilo:
   **id de infra não entra neste repo**, que é público — é a mesma regra do dado financeiro
   (`CLAUDE.md`). Um `infra-state.json` versionado violaria; e um não versionado se perde.
2. **Idempotente por construção: "descreve → cria ou atualiza", nunca "cria".** Rodar duas vezes
   tem que ser inofensivo, porque vai acontecer — o waiter da Aurora garante isso.
3. **Um recurso = uma função pura `ensureX({ client, params }) → id`**, no formato-alvo da T-104
   (1 função por arquivo, client **injetado**, teste com o SDK mockado). O `ensureX` é a unidade
   que o `carlin` substitui um dia.

**A migração futura para `carlin`**, quando o aprendizado já tiver sido colhido ou quando a
manutenção passar a doer: apagar `packages/infra` e escrever os templates equivalentes. Ela é
barata **por causa da regra 3 e de uma invariante que precisa ser mantida deliberadamente** —
nenhum código do app importa `packages/infra`. A infra é script de operação, não dependência de
runtime; o `graph-api` e os cores não sabem que ela existe. No dia da troca nada dentro de
`packages/*` se move, e o estado no SSM continua servindo. **Se um dia um core importar algo de
`infra`, esta porta se fecha** — é a única coisa a vigiar.

**O que eu não faria de outro jeito por causa desta decisão**: a ordem da fase 1 não muda, e os
passos 3, 4 e 5 (extrair CRUD, `postgresdb`, `query`) continuam sem tocar em AWS nenhuma.

## 9. Armadilhas que eu já enxergo

- **`isUniqueViolation` é a armadilha silenciosa da fase 1.** Ela não quebra o build nem o tipo:
  o dedupe de importação e a corrida de materialização de recorrência simplesmente param de ser
  tratados e viram 500. **Primeiro teste a escrever no passo 5**, antes de traduzir qualquer
  query.
- **Autenticado ≠ autorizado.** Cada query que hoje filtra por `user_id` na rota tem que
  continuar filtrando no resolver. Foi exatamente aqui que a OCA teve 13 resolvers cross-tenant,
  todos autenticados.
- **O `change-password` é o caso mais complicado do auth.** A T-092 já apanhou de um detalhe ali
  (o `SECRET_HASH` do refresh vai sobre o `sub`, não sobre o e-mail). É a primeira coisa a provar
  na fase 2, não a última.
- **As sessões atuais morrem** ao trocar o cookie `sid` pelo token do Cognito — e o
  `sessionStore` do SQLite some junto. Um login a mais; só não virar incidente.
- **Cold start no meio de uma cotação.** `GET /api/portfolio` chama a brapi em tempo real. Agora
  há dois Lambdas em série (graph-api → lambda-postgres-query) e a VPC no caminho. Medir antes de
  otimizar, mas já saber que existe.
- **Índice único anônimo no Sequelize empilha cópia a cada `sync --alter`** (§3). Regra no
  `CLAUDE.md` do package no primeiro dia.
- **`relay-compiler` no CI**: ou commita o gerado e o CI confere, ou gera no build. Escolher e
  travar — este repo já levou um "verde enganoso" do CI.
- **Migração de dados é destrutiva por natureza.** Dump fora do repo, conferido, antes da carga.

## 10. O que eu preciso para começar

As decisões **3 e 4** respondidas (a 2 saiu em 2026-09-20: SDK puro, §8.1), e o **passo 1 da
§5.4** (o Budget) feito. Com isso eu abro a
fase 1 no `BACKLOG.md` — e ela começa por onde não depende da AWS: extrair o CRUD das rotas para
os cores (§5.4, passo 3), que é trabalho útil mesmo que a migração pare no meio.
