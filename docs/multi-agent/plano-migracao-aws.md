# Plano — levar o app para a AWS: Postgres na Aurora, API REST no API Gateway

> **Virada de rumo (2026-09-20): o AppSync e o Relay SAÍRAM do plano.** O humano
> avaliou que o app é simples demais para pagar o preço deles, e concordo — o
> raciocínio está na §1.1. O arquivo mudou de nome (`plano-appsync-relay.md` →
> `plano-migracao-aws.md`); a **fase 1, que é o banco, não mudou em nada**.

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
Depois, o web falará com **as mesmas rotas REST**, servidas por Lambda atrás do **API Gateway**,
lendo um **Postgres** na nuvem. O contrato da API não muda; muda **onde ela roda** e **o que ela
lê**.

## 1.1 Por que o AppSync saiu (decisão do humano, 2026-09-20)

O AppSync entrega três coisas: uma linguagem de consulta, *subscriptions* em WebSocket e
resolvers gerenciados. **O app não usa nenhuma das três.** As rotas já devolvem exatamente o que
cada tela precisa, não há cliente terceiro pedindo formato diferente, e o desenho previa **um
único Lambda** para a API inteira — ou seja, nem a vantagem de "resolver sem código" se aplicava.

O que ele cobrava em troca está escrito nas versões anteriores deste documento e era caro:
**Relay no web** (compiler no CI, fragmentos, store), um **schema GraphQL** mantido em paralelo
aos tipos que já existem em `packages/shared`, e a regra de ownership reescrita **resolver a
resolver** — que foi exatamente onde a arquitetura de referência teve 13 resolvers cross-tenant,
todos autenticados.

Com API Gateway, a migração vira **"onde isso roda"** em vez de **"como isso é escrito"**: as
mesmas rotas, os mesmos tipos, os mesmos 440 testes de rota do `rest-api` continuam valendo como
rede de segurança durante a mudança.

**O que se perde, registrado para não ser redescoberto como surpresa**: (1) *subscriptions* —
os dois usos citados no plano antigo ("o Pix caiu", "o sync da Pluggy terminou") são polling hoje,
então não se perde nada que exista, mas push futuro vira WebSocket API do API Gateway, que dá
mais trabalho manual; (2) **uma requisição por tela** — com REST, uma tela que precisa de
portfolio e benchmarks faz dois `fetch`, que é o que ela já faz hoje.

**A porta continua aberta, e de graça**: o que viabiliza qualquer um dos dois é o **core com
`db`/`query` injetado** (T-104/T-110a). Um resolver do AppSync e um handler do API Gateway
chamam `listSavingsEntries({ db, userId })` do mesmo jeito.

## 2. O que se ganha e o que se perde

**Ganha**

- **O app deixa de morrer com o terminal.** Hoje ele só existe enquanto o Express está no ar na
  máquina do humano. Depois, existe sem ninguém ligado — e o catch-up de snapshots, que hoje
  depende de um boot, vira EventBridge.
- **Um banco de verdade.** Tipo `NUMERIC` para dinheiro, `ALTER TABLE ... DROP COLUMN` que
  existe, `ON CONFLICT` completo, tipos de data reais. Boa parte da ginástica do `packages/db`
  existe só porque o SQLite não tem isso (§5.3).
- **Domínio testável e portátil.** O trabalho da fase 1 (CRUD nos cores, `db`/`query` injetado)
  vale em qualquer transporte — é o que mantém a porta do AppSync aberta sem pagar por ela agora.
- **Acesso de qualquer lugar**, com HTTPS e certificado gerenciado, sem expor a máquina de casa.

**NÃO ganha** (e ganharia com o AppSync — registrado porque a conta foi feita, §1.1): uma
requisição por tela, subscriptions no lugar do polling do Pix, cache normalizado de graça, e o
fim do casing inconsistente por construção. O casing volta a ser o que é hoje: um débito com
tarefa própria no `BACKLOG.md`.

**Perde**

- **Quase nada do desenvolvimento offline.** Com o AppSync fora, o que sobra no caminho é
  Express — que roda local como sempre — e Postgres em container: `docker compose up postgres` e
  os `*-core` rodam na máquina, offline, contra o mesmo dialeto da nuvem. **O offline deixou de
  ser um custo da migração.**
- **Uma conta de nuvem no caminho de um app pessoal.** Uma configuração errada pode custar
  dinheiro.
- **Custo contínuo.** A Aurora Serverless v2 cobra capacidade mínima **enquanto existe**, não por
  uso. Para um app de um usuário, é o item caro do mês e não cai com o app parado (§8, decisão 4).
- **A sessão precisa de destino novo** (decisão 3, ainda aberta) — ver §6.1: o `sessionStore`
  em SQLite não sobrevive a Lambda.
- **Tempo — bem menos do que com AppSync.** Some a reescrita do transporte (65 endpoints, 57
  funções em `api.ts`, 16 arquivos que as chamam, Relay no web). **Sobra a reescrita do SQL**:
  os **176 pontos** da §5.1, que é o trabalho da fase 1 e aconteceria de qualquer jeito.
- **Cold start.** Lambda em VPC no caminho de uma request que já chama a brapi. Medir antes de
  otimizar, mas saber que existe.

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
     navegador (Vite + React, o mesmo de hoje)
        │  HTTPS — as MESMAS rotas /api/*
        ▼
   ┌───────────────────────────────────┐
   │  API Gateway (HTTP API)           │  authorizer = o user pool que já existe (T-106)
   └───┬───────────────────────────────┘
       │ proxy {proxy+}
       ▼
   ┌──────────────────────────┐
   │ Lambda: o Express de hoje│  serverless-http envolve o app inteiro
   │  routers + middleware    │───► brapi / Pluggy / AbacatePay  (direto, sem VPC)
   │  rotas = os *-core       │
   └──────────┬───────────────┘
              │ query({ text, values })
              ▼
   ┌──────────────────────────┐
   │ lambda-postgres-query    │  na VPC, read e write
   └──────────┬───────────────┘
              ▼
       Aurora Serverless v2 (Postgres)

   fora do Lambda da API, de propósito:
   EventBridge + Lambda ──► catch-up de snapshots (o cron que a T-109b removeu)
   S3 ──► front estático (o `dist` do Vite), com CloudFront na frente
```

**O Express continua existindo** — envolvido por `serverless-http`, sem reescrever rota
nenhuma. Foi a razão de peso para o API Gateway: os **440 testes de rota** do `rest-api`
continuam sendo a rede de segurança durante a migração do banco, e não viram lixo no meio do
caminho.

**Um Lambda só para a API inteira, não um por rota.** Com um usuário e um app deste tamanho,
partir em N funções multiplica cold start, configuração e deploy sem ganho nenhum. Se um dia uma
rota específica justificar isolamento (a de importação, que é pesada), ela sai para um Lambda
próprio sem mexer no resto.

**O `webhook da AbacatePay` é a exceção que precisa de cuidado**: ele depende de HMAC sobre os
**bytes crus** e de estar montado ANTES do `express.json()`. Com `serverless-http`, o corpo
chega do API Gateway possivelmente em base64 (`isBase64Encoded`) — se isso for decodificado na
ordem errada, a assinatura falha em produção e passa em teste. É o primeiro caso a provar na
fase 2, não o último.

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

1. ~~**(H) Budget com alarme.**~~ **FEITO em 2026-09-20.** Era pré-requisito de qualquer recurso
   na AWS — a Aurora cobra por existir.
2. ~~**(H) Confirmar a região.**~~ **FEITA em 2026-09-20: `us-east-1`**, a mesma do user pool
   (T-106). Todo recurso da migração nasce nela; um recurso em região diferente do user pool não
   é erro de custo, é latência e confusão de console.
3. **Extrair o CRUD das rotas para `*-core`** (eu). ~8 tarefas, uma por domínio, no formato-alvo
   (`db` injetado, 1 função por arquivo, Jest, cobertura 100%). **Tudo continua SQLite e continua
   REST** — nada de AWS aqui, e o app segue funcionando. Depois deste passo, os 70 pontos de SQL
   das rotas viram zero e existe um lugar único para reescrever cada query. **`savings-core` saiu
   na T-110a/b (PRs #180/#181) e é o molde.**
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
| **1. Banco** (§5) | CRUD extraído para os cores, `postgresdb`, `query`, Aurora, dados migrados | O app de hoje, REST, **rodando local** contra Postgres; contagens e somas batendo |
| **2. Sessão** (§6.1) | O `sessionStore` sai do SQLite; a autenticação passa a funcionar sem estado em disco | Login, `/me` e `change-password` verdes com o servidor sem arquivo nenhum |
| **3. A API na nuvem** | `serverless-http` + Lambda + API Gateway + `lambda-postgres-query` na VPC | As mesmas rotas respondendo por HTTPS; os 440 testes de rota inalterados |
| **4. O front na nuvem** | `dist` do Vite no S3 + CloudFront; `VITE_API_URL` apontando para o API Gateway | Abrir a URL num navegador que nunca rodou `pnpm dev` |
| **5. Bordas** | EventBridge para o catch-up de snapshots; webhook e upload conferidos no novo caminho | O catch-up acontece sem ninguém subir servidor |

**A ordem tem um porquê:** cada fase deixa o app inteiro funcionando. Só se troca **uma** coisa
por vez — primeiro o banco (com tudo local), depois a sessão, depois onde a API roda, depois
onde o front mora. Quando algo quebrar, o suspeito é um só.

### 6.1 A sessão é o problema real desta migração (e substitui o que o Relay impunha)

Hoje a sessão é `express-session` com cookie `sid` e store **em SQLite** (T-034/T-046). Num
Lambda isso não existe: não há disco entre invocações. Três saídas, e é exatamente aqui que a
**decisão 3** (§8) aterrissa:

1. **Token do Cognito no cliente, authorizer do API Gateway** — o cookie e o `sessionStore`
   somem, a validação do JWT acontece no gateway, e o Lambda recebe o `sub` já verificado.
   É o mais barato de operar e o que o API Gateway faz nativamente.
2. **Manter a sessão, com store em Postgres** — o cookie `sid` continua, e a tabela de sessões
   migra junto com o resto. Preserva o login como está, inclusive o `change-password`.
3. **Manter a sessão, com store em DynamoDB/ElastiCache** — mesma coisa, com mais uma peça de
   infra.

**Recomendo a 2 para a fase 2 e a 1 como destino.** A 2 é uma troca de store, não de
arquitetura: nada no web muda, e o `change-password` — que guarda o *access token* do Cognito na
sessão do servidor e já mordeu na T-092 — continua funcionando sem ser reescrito no meio da
migração de banco. A 1 é melhor no fim, quando houver menos coisa se mexendo ao mesmo tempo.

### 6.2 Testes

- **Core**: função com `db`/`query` injetado, mock puro — é o que a T-110a já entregou no
  `savings-core`.
- **Rota**: os testes de hoje, **sem alteração**. É o ponto inteiro de manter REST: eles seguem
  valendo durante a troca de banco e durante a ida para o Lambda.
- **Integração com Postgres**: a suíte roda contra container, não contra a Aurora — bater na
  nuvem em CI custa dinheiro e acopla o teste à rede.
- A política de testes do repo não muda: mudança de comportamento exige teste.

## 7. O que muda de forma, mesmo sem GraphQL

- **Webhook da AbacatePay.** Continua REST e continua exigindo bytes crus — atenção ao
  `isBase64Encoded` do API Gateway (§4).
- **Upload de OFX e CSV.** Hoje é `express.raw` com 1 MB. No API Gateway o teto de payload é
  **10 MB** e vale a pena, mais adiante, trocar por URL pré-assinada do S3 — não é pré-requisito
  de nada.
- **Catch-up de snapshots.** EventBridge + Lambda, chamando `catchUpIfNeeded`. É o retorno do
  que a T-109b removeu de propósito.

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
- **3 — o que substitui o `sessionStore` em SQLite: ABERTA, e mudou de forma com o AppSync
  fora.** Não é mais "token em memória × BFF": o BFF deixou de ser uma peça extra, porque o
  Express **continua existindo** (§4). Virou "trocar o store da sessão" × "trocar por JWT no
  gateway". **Recomendo store em Postgres na fase 2 e JWT como destino** — o raciocínio está na
  §6.1. Ponto de atenção que não muda: o `change-password` usa o access token guardado na sessão
  do servidor.
- **4 — teto de custo: RESPONDIDA em 2026-09-20.** O humano **criou o AWS Budget com alarme**.
  O passo 1 da §5.4 está feito.
- **5 — região: RESPONDIDA em 2026-09-20 — `us-east-1`.** A mesma do user pool do Cognito
  (T-106). O passo 2 da §5.4 está feito.
- **6 — transporte da API: RESPONDIDA em 2026-09-20 — API Gateway + Lambda, REST preservado.**
  Substitui o AppSync + Relay das versões anteriores; o raciocínio está na §1.1.

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
- **O `sessionStore` em SQLite não sobrevive ao Lambda** — é a decisão 3, e está na §6.1. Se
  virar troca de store, ninguém precisa relogar; se virar JWT, todo mundo reloga uma vez.
- **Cold start no meio de uma cotação.** `GET /api/portfolio` chama a brapi em tempo real. Há
  dois Lambdas em série (API → `lambda-postgres-query`) e a VPC no caminho. Medir antes de
  otimizar, mas já saber que existe.
- **Índice único anônimo no Sequelize empilha cópia a cada `sync --alter`** (§3). Regra no
  `CLAUDE.md` do package no primeiro dia.
- **`isBase64Encoded` do API Gateway** é a armadilha equivalente ao antigo `relay-compiler` no
  CI: o webhook da AbacatePay valida HMAC sobre bytes crus, e decodificar na ordem errada faz a
  assinatura falhar **só em produção**, com o teste verde. Provar cedo (§4).
- **Migração de dados é destrutiva por natureza.** Dump fora do repo, conferido, antes da carga.

## 10. O que eu preciso para começar

**Nada.** As decisões 1, 2, 4, 5 e 6 estão respondidas, e os passos 1 e 2 da §5.4 (Budget e
região) foram feitos pelo humano em 2026-09-20. A **decisão 3** (sessão) só é necessária na fase
2 — os passos 3, 4 e 5 da fase 1 não dependem dela.

Em curso agora, nesta ordem:

1. **Passo 3 — extrair o CRUD das rotas para os cores.** `savings-core` saiu na T-110a/b e virou
   o molde (formato-alvo + CRUD na mesma PR, Jest). Faltam os outros domínios.
2. **Passo 4 — `packages/postgresdb`**, com `sync` contra Postgres em container.
3. **Passo 5 — trocar a facade `db` por `query`**, onde os 176 pontos de SQL são tocados.

Os passos 6 a 8 (VPC, Aurora, Lambdas, migração dos dados) ficam **parados por decisão do
humano** (2026-09-20) até os três acima terminarem.
