# CLAUDE.md — @vetor-wallet/auth-core

Dono da tabela `users`: o **espelho local da identidade**, o perfil
(`name`/`phone`) e os papéis (`grantRole`). Extraído de
`packages/rest-api/src/api/auth/service.ts` na T-099c (Ciclo 19 — arquitetura em
módulos). Categoria **Core**, módulo **Auth** (ver `docs/MODULES.md` /
`docs/PACKAGES.md`).

É dono da tabela `users` e por isso importa `@vetor-wallet/db` — "Core" é *dono
das regras/dados do domínio*, não *nunca faz I/O*.

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

```
src/
├── service.ts   # validadores puros (isValidEmail/isValidName/isValidPhone/
│                # normalizePhone/parseRoles/serializeRoles), hash e verificação
│                # bcrypt, e o CRUD de users (createUser, findUserByEmail,
│                # findUserById, updateUserProfile, updateUserPassword,
│                # userExists, grantRole)
├── cognitoMirror.ts # T-106: espelho da identidade do Cognito —
│                # COGNITO_MANAGED_PASSWORD_HASH, findUserByCognitoSub,
│                # linkCognitoSub, createCognitoUser e a porta única
│                # findOrCreateUserByCognitoSub
└── index.ts     # barrel
```

`cognitoMirror.ts` **não** segue o formato-alvo (uma função por arquivo, `db`
injetado): o package inteiro ainda usa o singleton `db` e migra de formato numa
tarefa própria (T-104x). Misturar os dois estilos deixaria metade do package
testável de um jeito e metade de outro — pior que a inconsistência com o alvo.

Consumidores: `packages/rest-api/src/api/auth/{router,middleware}.ts` e
`packages/cli/src/grantAdmin.ts` (`pnpm --filter vetor-wallet-cli roles:grant-admin`).

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

`createUser` importa `getOrCreateDefaultWallet` de `@vetor-wallet/portfolio-core`
— **core → core de outro módulo**, contra a regra 6 de `docs/PACKAGES.md`. É o
acoplamento que já existia dentro do `server` (`auth/service.ts` importava
`../services/wallets`), apenas tornado explícito pela extração; a T-099c foi
movimentação mecânica e **não** o desfez. A saída natural seria a rota de
registro orquestrar os dois (é o único lugar onde dois módulos podem se cruzar),
mas isso muda quem é responsável por criar a carteira e fica para tarefa futura.

## Testes: o que veio e o que ficou no `server`

Veio para cá:

- **`service.test.ts`** — exercita as funções puras (`hashPassword`/
  `verifyPassword`, `isValidEmail`, `isValidName`, `isValidPhone`,
  `normalizePhone`) com `@vetor-wallet/db` mockado. Nenhum Express.

Ficou em `packages/rest-api/src/api/auth/`, porque sobe app Express com
`supertest` e testa rota/middleware, não o serviço:

- `middleware.test.ts` (`requireAuth`/`requireAdmin` com `Request`/`Response`)
- `router.ts` via `changePassword.test.ts` (T-094)
- `profile.test.ts` (`PATCH /api/auth/me`, T-092)
- `sessionPersistence.test.ts` (restart do server + `SqliteSessionStore`)

Também veio na T-106:

- **`cognitoMirror.test.ts`** — banco temporário de verdade (`DATABASE_URL` antes
  do `await import('@vetor-wallet/db')`), porque o que se prova ali é SQL:
  vínculo por e-mail com caixa diferente, unicidade do `sub`, e que o dado do
  usuário antigo continua no lugar depois do vínculo.

## Roadmap

**AWS Cognito entrou na T-106** — identidade única, login por `InitiateAuth`,
espelho por `cognito_sub`. O que **continua** TODO: recuperação de senha
(`ForgotPassword`), MFA, login social, e o `DROP` de `users.password_hash`
(migração destrutiva, precisa de confirmação do humano entre as etapas).

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Auth), `packages/db/CLAUDE.md` (sessões) e
`packages/portfolio-core/CLAUDE.md` (carteira única).
