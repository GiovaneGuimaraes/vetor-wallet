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

## Origem

Histórico completo em git: `git log -- docs/multi-agent/BACKLOG-ARQUIVO.md` (arquivo removido
do working set em 2026-08-09) e nas 130 PRs mergeadas.
