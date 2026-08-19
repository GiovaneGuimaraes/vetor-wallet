# CLAUDE.md — @vetor-wallet/cognito-core

Client HTTP do **AWS Cognito Identity Provider**, criado na T-106 quando o
Cognito passou a ser a **única fonte de identidade** do Vetor Wallet. Categoria
**Integração**, módulo **Auth** (ver `docs/MODULES.md`/`docs/PACKAGES.md`).

## As três decisões do humano que este package obedece (2026-08-18)

1. **Cognito é a única fonte de identidade.** O login não usa mais bcrypt e o
   banco não guarda senha nossa. A coluna `users.password_hash` continua lá, sem
   uso (dropá-la é migração destrutiva, tarefa própria).
2. **A tela de login continua nossa.** O `rest-api` chama `InitiateAuth`
   (`USER_PASSWORD_AUTH`) e `SignUp` e mantém o cookie de sessão `sid` do
   `express-session`. **Nada de Hosted UI, redirect OAuth ou JWT no browser** —
   `requireAuth` continua funcionando por sessão.
3. **A conta que já existia é vinculada por e-mail** ao `users.id` atual, via
   `users.cognito_sub`. Nenhum dado do dono do app se perde. Quem faz o vínculo é
   o `auth-core` (`findOrCreateUserByCognitoSub`), não este package.

Não reabra essas três em refactor: são decisão de produto, não escolha técnica.

## Fronteira: este package NUNCA toca o banco

Regra 2 de `docs/PACKAGES.md`, igual ao `pluggy-core`. Aqui só existe `fetch`:
autenticar, cadastrar, confirmar, traduzir e devolver **tipos nossos**. Quem
persiste identidade é o `auth-core` (dono da tabela `users`); quem cruza os dois
é `packages/rest-api/src/api/auth/router.ts`. Não importa `@vetor-wallet/db`,
`express`, nem outro `*-core`.

## Estrutura

```
src/
├── CognitoApiError.ts          # erro tipado + o vocabulário `CognitoErrorCode`
├── COGNITO_TIMEOUT_MS.ts       # 10s por request
├── mapCognitoError.ts          # __type da AWS → nosso code
├── resolveCognitoConfig.ts     # env, FAIL CLOSED; client secret opcional
├── isCognitoConfigured.ts      # o mesmo, em booleano, sem lançar
├── computeSecretHash.ts        # base64(HMAC-SHA256(username+clientId, secret))
├── secretHashFields.ts         # `SecretHash` × `SECRET_HASH` (nomes diferentes!)
├── cognitoIdpCall.ts           # o POST AWS JSON 1.1 (único lugar com fetch)
├── toCognitoSession.ts         # AuthenticationResult → CognitoSession
├── cognitoSignUp.ts            # SignUp → { userSub, userConfirmed }
├── cognitoConfirmSignUp.ts     # ConfirmSignUp (código do e-mail)
├── cognitoResendConfirmationCode.ts
├── cognitoInitiateAuth.ts      # login por senha
├── cognitoRefreshSession.ts    # REFRESH_TOKEN_AUTH (access token novo)
├── cognitoGetUser.ts           # GetUser → { sub, email }
├── cognitoChangePassword.ts    # ChangePassword (access token do usuário)
└── index.ts                    # barrel
```

Formato **alvo** (`docs/PACKAGES.md`): uma função exportada por arquivo, nome do
arquivo = nome da função, `index.ts` só barrel, cobertura **100%**. Duas
divergências conscientes do piloto (`subscription-core`), as mesmas do
`pluggy-core`: **runner é Vitest com teste ao lado** (é o padrão dos packages de
Integração, `brapi-core`/`pluggy-core`), e **`db` injetado não se aplica** —
não há I/O de banco aqui.

## Por que `fetch` e não o SDK da AWS

Todas as operações usadas são **não autenticadas por IAM**: a credencial é o
`ClientId` (+ `SECRET_HASH`) ou o access token do usuário. Sem IAM não há
**SigV4**, e sem SigV4 o SDK não paga o próprio peso — o protocolo é um POST JSON
com dois headers (`Content-Type: application/x-amz-json-1.1`,
`X-Amz-Target: AWSCognitoIdentityProviderService.<Action>`). É a mesma convenção
do `brapi-core` e do `pluggy-core`: client à mão, zero dependência.

O que o SDK traria é assinatura SigV4 para as operações `Admin*` — e essas a
T-106 **não** implementou (ver abaixo). Se um dia entrarem,
`@aws-sdk/client-cognito-identity-provider` vira dependência **deste** package
(não da raiz).

## `AdminConfirmSignUp` e `AdminSetUserPassword`: NÃO implementados

A T-106 pedia `adminConfirmSignUp` **só se** ele não exigisse credencial IAM além
do que já existe. Exige: toda operação `Admin*` do Cognito é chamada de
plano de controle assinada com **SigV4** por uma credencial IAM (access key ou
role) com permissão no user pool. O app não tem nenhuma das duas — nem variável
de ambiente, nem role. Implementar significaria pedir ao humano uma chave IAM com
poder de escrita no pool e guardá-la no servidor, o que é outra decisão e outro
risco. Então **não foi implementado**, e a consequência aparece na troca de senha
(abaixo).

## Troca de senha: `ChangePassword` com access token (decisão da T-106)

Dois caminhos existiam:

| Caminho | Precisa de | Valida a senha atual? | Escolhido |
|---|---|---|---|
| `ChangePassword` + access token do usuário | token na sessão do servidor | **sim**, na AWS | ✅ |
| `AdminSetUserPassword` | credencial IAM + SigV4 | não (seria nossa) | ❌ |

Trade-off aceito: a sessão precisa guardar `cognitoAccessToken` e
`cognitoRefreshToken`. Eles ficam em `req.session`, persistida no **SQLite** —
o cookie carrega só o `sid`, então **nenhum token chega ao browser**. O access
token vive ~1h e a sessão 7 dias, por isso existe `cognitoRefreshSession`: a
rota tenta trocar a senha, e num `invalidCredentials` renova o token e tenta uma
única vez antes de concluir "senha atual errada" (o Cognito usa o **mesmo**
`NotAuthorizedException` para os dois casos).

**A invariante da T-094 continua de pé**: a troca exige sessão e **não** a
invalida. O `ChangePassword` do Cognito não revoga tokens (quem revoga é
`GlobalSignOut`/`RevokeToken`, que não chamamos), e a rota não toca no cookie.

## Invariantes (não quebrar)

- **Nada degrada em silêncio.** Rede, timeout, status não-ok, corpo ilegível e
  envelope fora do contrato viram `CognitoApiError`. "Não consegui falar com o
  Cognito" nunca pode virar "senha inválida".
- **Nenhuma mensagem da AWS vaza para o cliente.** O erro carrega um `code` do
  nosso vocabulário fechado (ver `CognitoApiError`) e uma `message` escrita à
  mão, para log. Quem traduz para HTTP + português é
  `rest-api/src/api/auth/cognitoErrorResponse.ts`.
- **Nenhum segredo em mensagem, log ou erro**: senha, código de confirmação,
  `SECRET_HASH`, `COGNITO_CLIENT_SECRET`, access/id/refresh token. O erro de rede
  é escrito à mão e o original é descartado — o `cause` do `fetch` pode carregar
  a request com a senha dentro. Não há `console.log` neste package.
- **`SECRET_HASH` é opcional e o nome do campo muda com a operação.**
  `SignUp`/`ConfirmSignUp`/`ResendConfirmationCode` levam **`SecretHash`** na raiz
  do corpo; `InitiateAuth` leva **`SECRET_HASH`** dentro de `AuthParameters`. O
  Cognito ignora a chave errada e depois recusa por falta do hash — o sintoma é
  "senha inválida" numa senha correta. Um só lugar decide isso
  (`secretHashFields`), com `key` explícito.
- **`username` do hash = string exato do campo `Username`.** Por isso o e-mail é
  normalizado (`toLowerCase().trim()`) antes de tudo, o que também alinha com a
  invariante de e-mail normalizado do `auth-core`.
- **Este package não interpreta JWT.** O `sub` vem de `GetUser`, não de decodificar
  o id token. Decodificar sem verificar assinatura criaria um precedente que o
  próximo uso (sobre token vindo do cliente) transformaria em falha de segurança;
  verificar exigiria JWKS, cache e rotação por um ganho de um round-trip por login.
- **`ChallengeName` é erro (`challengeRequired`), não "sem token".** MFA e
  `NEW_PASSWORD_REQUIRED` estão fora do escopo da T-106 e precisam aparecer como
  não suportados, não como falha genérica.
- **Fail closed na configuração.** Sem `COGNITO_REGION`/`COGNITO_USER_POOL_ID`/
  `COGNITO_CLIENT_ID` nenhuma request sai: `configMissing` → 503 na rota.
- **Env lido dentro das funções**, nunca no top-level (mesmo motivo do
  `BRAPI_TOKEN` no `brapi-core`): permite trocar o env entre casos de teste.

## Contrato da API (assumido × confirmado)

Documentado pela AWS e implementado aqui:

- `POST https://cognito-idp.<region>.amazonaws.com/`, AWS JSON 1.1, ação no
  header `X-Amz-Target`. Erro: 4xx com `{ "__type": "...Exception", "message" }`.
- `SignUp` → `{ UserSub, UserConfirmed, CodeDeliveryDetails? }`.
- `InitiateAuth` `USER_PASSWORD_AUTH` → `{ AuthenticationResult: { AccessToken,
  IdToken, RefreshToken, ExpiresIn } }`; **exige `ALLOW_USER_PASSWORD_AUTH`
  habilitado no app client** — sem isso responde `InvalidParameterException`
  (primeiro lugar a olhar se o login não funcionar contra o pool real).
- `REFRESH_TOKEN_AUTH` → mesmo envelope **sem** `RefreshToken`.
- `ConfirmSignUp`, `ResendConfirmationCode`, `GetUser`, `ChangePassword`.
- `SECRET_HASH` = base64(HMAC-SHA256(`username` + `clientId`, `clientSecret`)).

**O que NÃO foi provado contra pool real** (o humano ainda estava configurando o
user pool quando a T-106 foi implementada — todos os testes usam HTTP mockado):

- se o pool dele tem **client secret** (os dois caminhos existem e têm teste);
- se o pool mantém **verificação de e-mail** (idem: `UserConfirmed` decide);
- o `SECRET_HASH` do fluxo **REFRESH_TOKEN_AUTH** — a AWS o documenta sobre o
  *username*, e em pools onde o username é o `sub` (e não o e-mail) o valor que
  guardamos na sessão pode não ser o esperado. Suspeito nº 1 se a renovação
  falhar num pool com secret;
- o formato exato de `__type` que aquele pool devolve (qualificado ou não — os
  dois são tratados).

## Variáveis de ambiente

`COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (obrigatórias, fail
closed) e `COGNITO_CLIENT_SECRET` (opcional — presente = toda chamada leva
`SECRET_HASH`). Valores reais vivem **só no `.env` local** (git-ignored) e são
preenchidos pelo humano; o repo é público. Ver `packages/rest-api/.env.example`.

## Fora de escopo (T-106)

MFA, login social, recuperação de senha (`ForgotPassword`/`ConfirmForgotPassword`),
deploy, `DROP` de `users.password_hash`, tela de digitar o código de confirmação
no `web` (o backend já tem `POST /api/auth/confirm` e `/resend-code` prontos), e
qualquer operação `Admin*`.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, `fetch` sempre mockado
  (`vi.stubGlobal`): **nenhum teste bate na AWS**. Cobertura 100%
  (`pnpm --filter @vetor-wallet/cognito-core test --coverage`).

Ver também `CLAUDE.md` da raiz, `packages/auth-core/CLAUDE.md` (espelho do `sub` e
tabela `users`), `packages/rest-api/CLAUDE.md` (as rotas) e `docs/MODULES.md`
(módulo Auth).
