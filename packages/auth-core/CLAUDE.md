# CLAUDE.md — @vetor-wallet/auth-core

Identidade e credenciais: registro, login (bcrypt), perfil (`name`/`phone`),
troca de senha e papéis (`grantRole`). Extraído de
`packages/server/src/api/auth/service.ts` na T-099c (Ciclo 19 — arquitetura em
módulos). Categoria **Core**, módulo **Auth** (ver `docs/MODULES.md` /
`docs/PACKAGES.md`).

É dono da tabela `users` e por isso importa `@vetor-wallet/db` — "Core" é *dono
das regras/dados do domínio*, não *nunca faz I/O*.

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
└── index.ts     # barrel
```

Consumidores: `packages/server/src/api/auth/{router,middleware}.ts` e
`packages/cli/src/grantAdmin.ts` (`pnpm --filter vetor-wallet-cli roles:grant-admin`).

## Invariantes (não quebrar)

- **`SALT_ROUNDS = 12`** no bcrypt. Cada `hashPassword` da mesma senha produz um
  hash diferente (salt aleatório) — nunca compare hashes, use `verifyPassword`.
- **E-mail é normalizado (`toLowerCase().trim()`) em TODA leitura e escrita** —
  `createUser`, `findUserByEmail` e `userExists`. Esquecer isso em um dos três
  cria contas duplicadas que não se acham.
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

Ficou em `packages/server/src/api/auth/`, porque sobe app Express com
`supertest` e testa rota/middleware, não o serviço:

- `middleware.test.ts` (`requireAuth`/`requireAdmin` com `Request`/`Response`)
- `router.ts` via `changePassword.test.ts` (T-094)
- `profile.test.ts` (`PATCH /api/auth/me`, T-092)
- `sessionPersistence.test.ts` (restart do server + `SqliteSessionStore`)

## Roadmap

**AWS Cognito** substituindo `service.ts` + `router.ts` (recuperação de senha,
MFA) segue como TODO. Sessões persistentes (T-034) já não são motivo para
migrar.

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Auth), `packages/db/CLAUDE.md` (sessões) e
`packages/portfolio-core/CLAUDE.md` (carteira única).
