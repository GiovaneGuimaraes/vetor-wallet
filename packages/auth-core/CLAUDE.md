# CLAUDE.md — @vetor-wallet/auth-core

Dono da tabela `users`: o **espelho local da identidade**, o perfil
(`name`/`phone`) e os papéis (`grantRole`). Extraído de
`packages/rest-api/src/api/auth/service.ts` na T-099c (Ciclo 19 — arquitetura em
módulos). Categoria **Core**, módulo **Auth** (ver `docs/MODULES.md` /
`docs/PACKAGES.md`).

É dono da tabela `users`. Desde a **T-116a** (passo 5 de
`docs/multi-agent/plano-migracao-aws.md`) **não importa mais `@vetor-wallet/db`**:
toda função recebe `query: Query` (`@vetor-wallet/query`) por injeção — `{ text,
values }`, placeholders `$1, $2`, `RETURNING id`, `rowCount`. O app segue em
SQLite (decisão 9, 2026-11-04): quem constrói o client (rota, CLI) usa
`createSqliteQuery(db)`; quando o Postgres entrar, troca-se só essa linha.

## O que a T-106 mudou aqui (leia antes de mexer em senha)

Desde a T-106 (2026-08-18) **a identidade é do AWS Cognito** e este package
**não é mais dono de credencial**:

- **`login` não usa bcrypt.** Quem valida senha é `@vetor-wallet/cognito-core`,
  chamado pela rota. `verifyPassword`/`hashPassword`/`updateUserPassword`
  **continuam existindo mas não estão no caminho do login**.
- **`users.password_hash` continua na tabela, sem uso.** Dropar a coluna é
  migração destrutiva e vai em tarefa própria (regra das duas etapas em
  `docs/multi-agent/README.md`). Espelho criado pelo Cognito grava
  `COGNITO_MANAGED_PASSWORD_HASH` — um sentinela que **não é** hash bcrypt
  válido, então `verifyPassword` devolve `false` para qualquer senha (falha
  fechada por construção).
- **`createUser(email, password)` sobrou para dois usos legítimos**: contas
  criadas antes da T-106 e os testes que precisam de uma linha "pré-Cognito". Não
  use em fluxo novo de registro — o registro passa pelo Cognito e o espelho nasce
  em `findOrCreateUserByCognitoSub`.
- **`updateUserPassword` não é mais chamado por rota nenhuma.** A troca de senha
  virou `ChangePassword` no Cognito (ver `packages/cognito-core/CLAUDE.md`). A
  invariante da T-094 **não** mudou: exige sessão e não a invalida.

**O que NÃO está aqui, de propósito:**

- `api/auth/middleware.ts` (`requireAuth`/`requireAdmin`) e `api/auth/router.ts`
  **ficam no `server`**: são Express (`req`/`res`/`next`), e core não importa
  Express (regra 1 de `docs/PACKAGES.md`). O middleware consome `parseRoles`
  daqui.
- `sessionStore.ts` (sessões persistentes em SQLite, T-034/T-046) vive em
  `packages/db` desde a T-097 — ver `packages/db/CLAUDE.md` e
  `docs/decisions/sessions-auth.md`.

## Estrutura

Formato-alvo (T-116a): **uma função por arquivo**, nome do arquivo = nome da
função, `src/index.ts` só reexporta. Funções com I/O recebem um objeto de
parâmetros `{ query, ... }`; as puras (`isValidEmail`, `isValidName`,
`isValidPhone`, `normalizePhone`, `parseRoles`, `serializeRoles`,
`hashPassword`, `verifyPassword`) não recebem `query`.

- CRUD de `users`: `createUser`, `findUserByEmail`, `findUserById`,
  `updateUserProfile`, `updateUserPassword`, `userExists`, `grantRole`.
- Espelho do Cognito (T-106): `COGNITO_MANAGED_PASSWORD_HASH`,
  `findUserByCognitoSub`, `linkCognitoSub`, `createCognitoUser`, a porta única
  `findOrCreateUserByCognitoSub` e o erro `CognitoLinkRequiresVerifiedEmailError`.
- Internos (fora do `index.ts`): `toUser` (linha → `User`, sem `password_hash`) e
  `SELECT_COGNITO_USER`.

Consumidores: `packages/rest-api/src/api/auth/{router,middleware}.ts`
(`const query = createSqliteQuery(db)` no topo do router; o middleware só usa
`parseRoles`) e `packages/cli/src/{grantAdmin,pluggyCli}.ts`.

## Invariantes (não quebrar)

- **`SALT_ROUNDS = 12`** no bcrypt. Cada `hashPassword` da mesma senha produz um
  hash diferente (salt aleatório) — nunca compare hashes, use `verifyPassword`.
  Desde a T-106 isso vale só para as contas antigas e para teste: **o login não
  passa por aqui**.
- **E-mail é normalizado (`toLowerCase().trim()`) em TODA leitura e escrita** —
  `createUser`, `findUserByEmail`, `userExists` e, desde a T-106,
  `createCognitoUser` e `findOrCreateUserByCognitoSub`. Esquecer isso em um deles
  cria contas duplicadas que não se acham — e no caminho do Cognito o custo é
  maior: o vínculo por e-mail é justamente o que preserva a conta que já existia,
  então uma caixa diferente no pool faria a carteira e o histórico do dono
  "desaparecerem" sem nada ter sido apagado.
- **`findOrCreateUserByCognitoSub` é a porta ÚNICA do login para o banco**, e a
  ordem dos três caminhos é regra: (1) `cognito_sub` conhecido — o `sub` nunca
  muda, nem se o e-mail mudar no pool; (2) `sub` novo com e-mail existente →
  **vincula** (é o passo que preserva os dados, decisão do humano de 2026-08-18);
  (3) e-mail novo → cria o espelho. `idx_users_cognito_sub` (único, parcial)
  garante que uma corrida entre dois logins falhe em vez de duplicar conta.
- **O VÍNCULO POR E-MAIL EXIGE E-MAIL VERIFICADO NO PROVEDOR.** O caminho (2) só
  acontece com `emailVerified: true` — vindo do `email_verified` que o Cognito
  devolve no `GetUser`, nunca do corpo da request. Sem verificação, lança
  `CognitoLinkRequiresVerifiedEmailError` **antes de qualquer escrita** (nem
  `cognito_sub` na conta existente, nem conta nova), e a rota traduz para **403
  `EMAIL_NOT_VERIFIED`**.
  **Por quê:** conta anterior ao Cognito tem `cognito_sub` NULL e o registro não
  checa e-mail existente no nosso banco (de propósito, para ela poder ganhar
  identidade no pool). Então qualquer um que saiba o e-mail da vítima se cadastra
  com aquele e-mail e — num pool que não verifica e-mail — receberia a conta dela
  inteira: carteira, despesas, poupança, assinatura. Achado de revisão da própria
  T-106; ver o docblock do erro para o passo a passo.
  Detalhes que não devem ser "simplificados": o parâmetro é **obrigatório** (um
  default reabriria o buraco em silêncio no próximo chamador); `emailVerified`
  **não** é `UserConfirmed` (pool pode auto-confirmar sem verificar e-mail);
  **criar espelho novo continua liberado sem verificação** (não há conta de
  ninguém para assumir); e "vincular só o primeiro `sub`" **não** substitui o
  gate — o ataque *é* a primeira vinculação, porque a vítima nunca logou lá.
  A regra vale para **qualquer** provedor de identidade que venha depois: é o que
  separa "mesmo e-mail" de "mesma pessoa".
- **`linkCognitoSub` sobrescreve um `sub` anterior de propósito**: com e-mail
  único no pool, "mesmo e-mail, outro `sub`" só acontece quando a conta foi
  apagada e recriada lá — mesma pessoa, identidade nova. Recusar trancaria o dono
  fora dos próprios dados sem saída pela UI.
- **`createUser` cria a carteira padrão, e uma falha ali NÃO derruba o registro**
  (T-050a): a chamada a `getOrCreateDefaultWallet` está em `try/catch` que só
  loga — o lazy-create do `GET /api/wallets` segue como rede de segurança.
- **A troca de senha exige sessão e NÃO a invalida** (T-094). `updateUserPassword`
  só faz hash + `UPDATE`; quem valida a senha atual (`verifyPassword`) e o
  tamanho da nova (>= 8, mesma regra do register) é o router.
- **`roles` é JSON em coluna TEXT, lido por `parseRoles` (fail-safe)**: JSON
  inválido ou não-array vira `[]`, nunca lança. Uma exceção aqui derrubaria o
  `requireAdmin` de toda request.
- **`grantRole` é idempotente**: papel já presente responde
  `{ granted: false }` sem escrever.
- **`updateUserProfile` é PATCH parcial de verdade**: usa `'name' in update`
  (não truthiness) para distinguir "campo ausente" de `null` (limpar o campo).
  `name` é trimado; `phone` passa por `normalizePhone` (só dígitos) antes de
  persistir.
- **`findUserByEmail`/`findUserById` devolvem o `password_hash`** — são as únicas
  funções que o expõem. Nunca devolva esse objeto direto numa resposta HTTP.

## Dependência de `@vetor-wallet/portfolio-core` (nota de arquitetura)

`createUser` e `createCognitoUser` chamam `getOrCreateDefaultWallet({ query,
userId })` de `@vetor-wallet/portfolio-core` — **core → core de outro módulo**,
contra a regra 6 de `docs/PACKAGES.md`. É o acoplamento que já existia dentro do
`server`, tornado explícito pela extração (T-099c); a saída natural seria a rota
de registro orquestrar os dois, mas isso muda quem é responsável por criar a
carteira e fica para tarefa futura. O mesmo `query` injetado é repassado.

## Testes

Jest, cobertura 100% (meta do formato), em `tests/unit/tests/`, com o mock de
`query` de `tests/unit/testQuery.ts` — sem banco. `portfolio-core` é mockado com
factory. Rodar: `pnpm --filter @vetor-wallet/auth-core test`.

**Prova contra SQLite real fora do package (T-116a):** o teste de banco que existia
saiu daqui — o mock prova a ordem dos caminhos e o gate de `emailVerified`, mas
**não** prova o SQL nem o índice. A prova mora em: `packages/db/src/schema.test.ts`
(`idx_users_cognito_sub`: sub duplicado falha, contas legadas sem sub convivem),
`packages/rest-api/src/api/auth/authCoreSqlite.test.ts` (as funções contra SQLite
real via `createSqliteQuery`: re-vínculo de `sub`, `findUserById`, `userExists`,
`updateUserPassword`, `grantRole`, `updateUserProfile`) e `cognitoAuth.test.ts`
(vínculo por e-mail, via rotas). Ficam
em `packages/rest-api/src/api/auth/` também `middleware.test.ts`,
`changePassword.test.ts`, `profile.test.ts` e `sessionPersistence.test.ts`.

## Roadmap

**AWS Cognito entrou na T-106** — identidade única, login por `InitiateAuth`,
espelho por `cognito_sub`. O que **continua** TODO: recuperação de senha
(`ForgotPassword`), MFA, login social, e o `DROP` de `users.password_hash`
(migração destrutiva, precisa de confirmação do humano entre as etapas).


## Convenções

- Uma função por arquivo; `query` injetado; `$N` nunca repetido numa mesma
  query (ver `packages/query/CLAUDE.md`); teste em `tests/unit/tests/`.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Auth), `packages/db/CLAUDE.md` (sessões) e
`packages/portfolio-core/CLAUDE.md` (carteira única).
