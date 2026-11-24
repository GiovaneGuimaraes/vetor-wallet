# Guia de limpeza do repositório

Leitura obrigatória do bot de limpeza (Cleber) antes de remover qualquer coisa. Regra-mãe:
**na dúvida, não apague — reporte.** Limpar é reversível só enquanto o dado existe em outro lugar;
confirme isso antes, nunca depois.

## Modo de operação

1. **Primeiro um relatório, depois a remoção.** A primeira passada é só leitura: liste o que
   pretende remover, com o motivo e a prova de que é seguro. Só remova o que o humano aprovar,
   exceto as categorias marcadas como "autônomo" abaixo.
2. **Uma categoria por vez**, na ordem desta página. Termine uma e reporte antes da próxima.
3. **Nunca force.** Sem `git push --force`, `git reset --hard`, `git clean -fdx`, `git branch -D`
   em branch que não provou integrada, nem `--no-verify`. A `main` tem ruleset contra força e
   deleção: se algo parecer exigir isso, a operação está errada.
4. Rode tudo a partir do checkout em que está; **nunca** `cd` para outro worktree para limpar
   de lá o que não é seu.

## O que PODE limpar

### 1. Worktrees órfãos de subagentes (autônomo, depois de checar)

Onde: `.claude/worktrees/agent-*` (ignorado pelo `.gitignore`) e as branches `worktree-agent-*`.

Para cada um, nesta ordem:

1. `git -C <worktree> status --porcelain` — **se houver qualquer alteração, commite o WIP numa
   branch própria (`wip/<nome>`) antes de qualquer remoção.** Nunca descarte worktree sujo.
2. Confirme que a branch está integrada na `main`. `git branch --merged` **não basta**: PRs
   entram por squash e acusam falso "não mergeada". Use `git cherry main <branch>` (linha `-` =
   conteúdo já aplicado). Se ainda acusar pendência, compare a API exportada dos arquivos
   tocados; se continuar duvidoso, **não apague** e liste no relatório.
3. Só então: `git worktree remove <caminho>`. No Windows ele falha quando há `node_modules` —
   nesse caso remova o diretório à mão e rode `git worktree prune`.
4. Apague a branch local `worktree-agent-*` com `git branch -d` (minúsculo). Se o `-d` recusar,
   é sinal de que não está integrada: pare e reporte, não escale para `-D`.

Observação: o estado do repositório principal mudou depois da última nota do `ORQUESTRADOR.md`
("o git não referencia nenhum"). Confira `git worktree list` na hora; não confie na doc.

### 2. Branches integradas (autônomo, depois de checar)

- Branches locais e remotas já integradas pela mesma prova do item acima (`git cherry`).
- Branches de PR local (`pr-<número>`), `tmp-review` e similares, **se** integradas ou sem
  commit exclusivo.
- Branch remota: `delete_branch_on_merge` já está ligado no GitHub, então sobra pouco; só apague
  remota que a prova mostrar integrada, com `git push origin --delete <branch>`.

### 3. Artefatos de build e teste regeneráveis (autônomo)

`dist/`, `coverage/`, `reports/`, `.stryker-tmp/`, `*.tsbuildinfo`, `*.log`. Todos regeneram com
`pnpm build`/`pnpm test` e estão no `.gitignore`.

### 4. `node_modules` de worktrees que você está removendo

Só dentro do worktree que está sendo removido. Nunca o `node_modules` da raiz de um checkout em
uso: o reinstall (`pnpm install --frozen-lockfile`) custa tempo e rede.

### 5. Pedir aprovação antes (nunca autônomo)

- Branches com commit exclusivo não integrado (podem ser trabalho abandonado ou em andamento).
- Itens de `stash` (a pilha é **compartilhada** entre todos os worktrees e sessões).
- Arquivos soltos na raiz que pareçam lixo mas estejam versionados.
- Qualquer coisa que você não saiba classificar.

## O que NÃO pode limpar (nunca, nem com aprovação genérica)

### Dado financeiro e banco

- **Nenhum `*.db`** (`packages/*/data/`, incluindo `wallet.db`) é lixo. Pode ser o banco real do
  humano; o repo é público e o `.gitignore` o deixa de fora **justamente porque ele existe só
  em disco**. Apagar é perda definitiva. Não abra, não copie, não descreva o conteúdo.
- **Backups fora do repo** (`Desktop\vetor-wallet-backups\`): são a única reversibilidade de uma
  migração destrutiva. Não toque.
- Não coloque valor, nome de estabelecimento, saldo ou id de conta em relatório, issue, PR ou
  mensagem de commit. Descreva de forma relativa.

### Credenciais

- Todo `.env` e `.env.*` (só o `.env.example` é versionado). Não apague, não imprima o conteúdo,
  não mova.

### Código e documentação vivos

- `CLAUDE.md` (raiz e dos packages), `docs/**` — em especial `docs/decisions/`,
  `docs/multi-agent/BACKLOG.md`, `TODO-HUMANO.md`, `CALIBRAGEM.md`, `ORQUESTRADOR.md`.
  Esses arquivos são o estado do projeto; quem os edita é o orquestrador, não o bot de limpeza.
- `.claude/agents/` e `.claude/skills/` — são os prompts dos agentes. Mudar sem evidência é
  proibido (ver tabela de versões em `CALIBRAGEM.md`).
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `skills-lock.json`, `tools/` (o `backlog-guard.mjs`
  alimenta o `pnpm backlog:check`), `LICENSE`, os logos.
- `packages/*/src`, `packages/*/tests`, migrations e schema (`packages/db`, `packages/postgresdb`).
  "Código que parece não usado" é achado para reportar, nunca para apagar.

### Git

- A branch `main` e qualquer branch **com PR aberto**.
- O worktree/branch **em que você está** e o checkout principal.
- Worktrees de outros usuários do Orca (`~/orca/workspaces/**`) que não sejam do Vetor Wallet ou
  que estejam em uso por outra sessão. Antes de tocar num worktree, veja se há processo ou
  sessão ativa nele.
- Stash: nunca `git stash pop`/`drop` por conta própria. Se for preciso, a regra do ambiente vale
  (identificar pelo SHA e tag única, `apply` em vez de `pop`).

## Checklist antes de remover um item

- [ ] Não está em nenhuma lista "NÃO pode limpar".
- [ ] `git status` limpo ou WIP commitado numa branch própria.
- [ ] Prova de integração (`git cherry`) anexada ao relatório, ou item fora da remoção.
- [ ] Nenhum processo/servidor dev rodando naquele diretório (porta 3001 livre).
- [ ] O que sai está no relatório, com o motivo.

## Formato do relatório

Devolva dados, não prosa:

```
REMOVIDO:    lista (worktrees, branches, artefatos) + prova de segurança de cada um
PRESERVADO:  o que parecia limpável e ficou, com o motivo
PRECISA DO HUMANO: itens da categoria 5, com o que falta para decidir
ESPACO:      quanto liberou (se medido)
```

Sem valores financeiros, sem conteúdo de `.env`, sem nomes de estabelecimento.
