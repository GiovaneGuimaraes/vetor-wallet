# Calibragem do roteamento de modelos

Dado observado dos ciclos 1–20, extraído do backlog antes de ele ser enxugado (2026-08-09).
Existe para o `README.md` § "Roteamento de modelos" ser calibrado por evidência e não por
intuição. **Uma linha por fato; se não muda decisão de roteamento, não entra aqui.**

## Placar por modelo de executor

| Executor | Tarefas | Reprovações | Onde falhou |
|---|---|---|---|
| **Haiku** | 8 | 0 de código | T-095: código certo, **relatório errado** (alegou falha inexistente + comentário duplicado) |
| **Sonnet** | ~20 | 9 | estado/UI e casos de borda — ver abaixo |
| **Opus** | 4 (T-084, T-085, T-099b, T-099c) | 0 | — |

## As 9 reprovações e o que causou cada uma

| Tarefa | Executor | Causa |
|---|---|---|
| T-076 | Sonnet | race: `defaultOpen` não-controlado congelava antes do fetch popular o estado |
| T-080 | Sonnet | CTA renderizado sem o gate `walletLoaded && !walletLoadError` |
| T-020 | Sonnet | inconsistência visual entre 5 pages + lógica duplicada em 5 arquivos |
| T-035 | Sonnet | recorrência de lançamento com data passada materializava meses fechados |
| T-034 | Sonnet | histórico congelava após criar/editar/excluir — dois valores contraditórios na tela |
| T-023 | Sonnet | falha de rede no `getWallets()` auto-criava carteira espúria |
| T-013 | Sonnet | lógica de cálculo em módulo puro sem teste (CLAUDE.md exige) |
| T-049 | Sonnet | CLAUDE.md contraditório + lacuna de teste positivo |
| T-053 | Sonnet | instrução equivocada **do orquestrador** (remoção de acentos contra o padrão do repo) |

## Padrões que valem como regra

- **Reprovação não é falta de capacidade do modelo, é classe de problema.** Nenhuma reprovação
  caiu em cálculo financeiro — essas foram para Opus e passaram. Caíram em **estado assíncrono,
  gates de render e consistência entre N arquivos**, que é onde lint, build e suíte passam
  verdes e o código está errado mesmo assim (lição registrada na T-020).
- **Tarefa de UI "repetir o mesmo tratamento em N pages" precisa ser conferida lendo as N
  pages lado a lado**, nunca pelo relatório do executor (T-020).
- **Haiku acerta o código e pode errar o relato** (T-095). Com Haiku, verifique o diff, não a
  prosa do retorno.
- **Uma reprovação foi culpa do prompt do orquestrador** (T-053). Antes de escalar modelo,
  verifique se a instrução estava certa.
- **Risco sem teste exige execução, não leitura**: `snapshotScheduler` roda no boot e nenhum
  teste pega se parar de ser chamado — executor e revisor confirmaram subindo o server
  compilado com `setInterval` instrumentado (T-099c). Repetir em qualquer mudança no
  `api/index.ts`.

## Versões dos prompts dos agentes

`.claude/agents/executor.md` e `revisor.md` são a peça que mais muda comportamento por caractere
alterado, e até 2026-08-15 mudavam sem rastro do *porquê* — o git guarda o **que** mudou, não a
evidência que motivou. Uma linha por alteração; se a mudança não veio de uma evidência, ela não
deveria estar sendo feita.

| Data | Arquivo | O que mudou | Evidência que motivou |
|---|---|---|---|
| 2026-08-15 | `revisor.md` | veredito exige a saída real do comando de teste, não "passou"; comandos de teste corrigidos para os do monorepo atual | T-095 (relatório errado com código certo) + os filtros citados eram os de antes do rename `server` → `rest-api` (T-100) |
| 2026-08-15 | `executor.md` | saída real dos testes no relatório, não resumo; regra de escrita em `BACKLOG.md`/Discord reescrita com o motivo (conflito entre worktrees) | T-095 (relatório errado) e revisão da fronteira do executor |

## Dataset de regressão (as 9 reprovações como eval)

As reprovações acima são o **único dado real** que temos sobre o que este fluxo deixa passar — e
saem de graça. Ao mexer no prompt do executor ou do revisor, escolha **duas** linhas e confirme
que o prompt novo ainda pegaria aquele achado. Não é eval automatizada: é leitura dirigida, com o
caso na mão. O ponto é ter um *veredito* antes de aceitar a mudança, em vez de só achar que
ficou melhor.

| Caso | O sinal que o revisor tinha que ver | Classe |
|---|---|---|
| T-076 | prop não-controlada (`defaultOpen`) lida antes de o fetch popular o estado | estado assíncrono |
| T-034 | tela com dois valores contraditórios após mutação — histórico não refetch | estado assíncrono |
| T-080 | CTA renderizado sem o gate `walletLoaded && !walletLoadError` | gate de render |
| T-023 | erro de rede tratado como "lista vazia" e disparando criação | gate de render |
| T-020 | o mesmo tratamento repetido em 5 pages, conferido **lendo as 5**, não o relatório | consistência entre N arquivos |
| T-035 | recorrência com data passada materializando meses já fechados | caso de borda de data |
| T-013 | módulo puro com lógica de cálculo e sem teste (o `CLAUDE.md` exige) | política de testes |
| T-049 | `CLAUDE.md` contraditório + faltando teste do caminho positivo | política de testes |
| T-053 | a **instrução do orquestrador** estava errada, não o código | prompt, não modelo |

**Limite honesto**: o diff exato que foi reprovado nem sempre sobrevive (foi corrigido na mesma
branch antes do merge). O que se reusa aqui é o **caso** — a situação e o sinal —, não um
artefato pronto para rodar. Reconstituir o diff, quando vale, é `git log` na branch da tarefa.

## Origem

Histórico completo em git: `git log -- docs/multi-agent/BACKLOG-ARQUIVO.md` (arquivo removido
do working set em 2026-08-09) e nas 130 PRs mergeadas.
