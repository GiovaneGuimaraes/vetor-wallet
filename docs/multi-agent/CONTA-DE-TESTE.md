# Conta de teste dos agentes

Usuário **real** no user pool do Cognito de staging, criado pelo humano em 2026-11-08 para o agente
exercitar o app de verdade (não só a suíte). Existe porque lint, build e testes passam verdes com o
código errado nas classes que mais nos reprovam (`CALIBRAGEM.md`): estado assíncrono, gates de
render e consistência entre N arquivos. Aí a evidência é **subir o app e observar**.

## O valor nunca entra neste repo

O repo é público. **E-mail e senha da conta ficam fora dele** — nem neste arquivo, nem em PR,
commit, issue, log colado ou relatório de agente. Este documento diz *como usar*, não *com o quê*.

As credenciais vivem num arquivo **fora do repo**, no diretório do usuário do humano:

```
~/.vetor-wallet/agent-test.env        # Windows: C:\Users\<usuario>\.vetor-wallet\agent-test.env
```

```bash
AGENT_TEST_EMAIL=...
AGENT_TEST_PASSWORD=...
```

Fora do repo de propósito: worktrees de executor nascem sem nenhum `.env` (git-ignored), e um
`.env` dentro do worktree some quando ele é removido. Se o arquivo não existir, **o agente não
inventa conta nem pede a senha no chat** — registra o bloqueio em `TODO-HUMANO.md`.

## O que a conta é (e o que não é)

- **Login real pelo Cognito**: `POST /api/auth/login` do `rest-api` valida contra o pool. Não há
  atalho de dev que pule o Cognito — decisão do humano (2026-11-08): o caminho de auth que o
  agente testa é o mesmo do usuário.
- **Sem assinatura necessária**: `BILLING_ENABLED=false` em staging, então o gate de escrita é
  no-op. Se um dia ligar, a conta precisa de assinatura ativa (`/api/billing/simulate`, que já
  responde 404 em produção).
- **A linha em `users` nasce no primeiro login** (espelho da identidade — `auth-core`), por
  `DATABASE_URL` local. Cada worktree com banco próprio cria a sua. Para a role de admin:
  `pnpm --filter vetor-wallet-cli roles:grant-admin <email>` (só se a tarefa toca `/admin`).
- **Dado fictício apenas.** O que o agente grava na conta é inventado. Nunca importar OFX, Pluggy
  ou qualquer dado financeiro real do humano nela (regra da raiz).
- **Não use contra produção.** Hoje não existe produção; se passar a existir, esta conta não vai
  junto.

## Como o agente usa

Pré-requisito: `packages/rest-api/.env` com `COGNITO_REGION`, `COGNITO_USER_POOL_ID` e
`COGNITO_CLIENT_ID` (sem elas `/api/auth/*` responde 503). Sobe a API com o banco do worktree:

```bash
set -a; . ~/.vetor-wallet/agent-test.env; set +a
pnpm dev:server   # porta 3001; derrube ao terminar

curl -s -c /tmp/agent.cookies -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AGENT_TEST_EMAIL\",\"password\":\"$AGENT_TEST_PASSWORD\"}" \
  http://localhost:3001/api/auth/login
curl -s -b /tmp/agent.cookies http://localhost:3001/api/wallets
```

O cookie `sid` vai no jar de cookies; **não imprima o corpo do login nem o jar** (tem tokens de
sessão) e use o diretório scratchpad, não `/tmp`, quando a sessão tiver um. Para UI, o mesmo login
pela tela com a ferramenta de browser.

Ao terminar: derrube o servidor (`EADDRINUSE` já mordeu duas vezes) e apague o jar de cookies.

## Evidência que o agente cola no relatório

Para tarefa cujo risco o teste não cobre (ver "Evidência de fechamento" no `README.md`): o comando
executado e o **resultado real** — status e corpo da chamada, e as linhas de log do app que
mostram o evento (`event`, `requestId`, status). Sem e-mail, sem senha, sem valor financeiro, sem
cookie. Se a evidência exigir colar algo sensível, descreva de forma **relativa**.

## Se a conta quebrar

Login 401/`EMAIL_NOT_VERIFIED`/senha expirada: não tente recuperar sozinho por `forgot-password`
(o código chega no e-mail do humano). Registre em `TODO-HUMANO.md` e siga com a suíte, dizendo no
relatório que a evidência de runtime **não foi coletada** e por quê.
