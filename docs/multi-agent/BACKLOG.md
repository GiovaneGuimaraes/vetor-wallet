# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Modelo de tarefa

```markdown
### T-001 — Título curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Depende de**: — (ou T-xxx; tarefas com dependência não paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe; link para prioridade no ORQUESTRADOR.md
- **Escopo**: o que fazer, arquivos-alvo prováveis
- **Fora de escopo**: o que NÃO fazer
- **Critério de aceite**: verificável — "dado X, quando Y, então Z" + comando de teste
- **Resultado**: (preenchido ao concluir: resumo, arquivos, testes rodados)
```

---

## Tarefas ativas

_(vazio — próximo ciclo popula a partir das prioridades do `ORQUESTRADOR.md`; candidata: tarefa de redesign visual real, ver ressalva do revisor na T-001)_

## Concluídas (aguardando merge — aprovação humana pendente)

### T-001 — Aplicar paleta 60-30-10 via CSS custom properties
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovação humana)
- **Prioridade**: P1
- **Depende de**: —
- **Branch/worktree**: `giovane/t-001-paleta-60-30-10` (commit `c04a925`) — PR [#44](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/44)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` — redesign visual com regra 60-30-10. A proposta de paleta vai para o `TODO-HUMANO.md` para aprovação antes de merge.
- **Escopo**: Definir a paleta 60-30-10 (avaliar se mantém o tom areia `#e3d5b8` como base) e aplicá-la exclusivamente via CSS custom properties em `web/src/index.css`. Documentar em comentário no `index.css` qual cor é 60, qual é 30 e qual é 10. Preservar cores semânticas de lucro/prejuízo (verde/vermelho) fora da conta 60-30-10. Ajustar usos de cor hardcoded nos componentes apenas se necessário para que consumam as variáveis.
- **Fora de escopo**: responsividade/media queries (T-002); framework CSS novo; mudanças de layout ou markup além de troca de cor.
- **Critério de aceite**: todas as cores de tema saem de custom properties em `index.css`; comentário documenta o papel 60/30/10 de cada cor; verde/vermelho de P&L intactos; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudança puramente visual (CSS) — política do CLAUDE.md dispensa teste novo.
- **Resultado**: O tema existente já seguia a proporção 60-30-10; o executor manteve todos os valores de cor e documentou os papéis em comentário (`index.css`, único arquivo alterado). Paleta: 60% canvas `#0f0e0b` dark / `#f4efe5` light; 30% cards/superfícies/bordas; 10% destaque areia `#e3d5b8` dark / `#a8814f` light (mantido por ser identidade da marca). P&L verde/vermelho fora da conta, intactos. Build ok. Revisor: APROVADA, com ressalva de que isso cumpre o critério literal da tarefa mas não constitui o "redesign" da prioridade 1 — decisão registrada no `TODO-HUMANO.md`.

### T-002 — Responsividade mobile (viewport ≥360px) em todas as telas
- **Status**: CONCLUIDA (revisada e APROVADA; merge aguarda aprovação humana)
- **Prioridade**: P1
- **Depende de**: — (paralela a T-001; toca `App.css` e componentes, não `index.css`)
- **Branch/worktree**: `giovane/t-002-responsividade-mobile` (commit `7b4b807`) — PR [#45](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/45)
- **Contexto**: Prioridade 1 do `ORQUESTRADOR.md` — todas as telas usáveis em mobile.
- **Escopo**: Tornar dashboard, operações, auth e admin usáveis em viewport ≥360px: tabelas com scroll horizontal próprio ou layout empilhado, formulários em coluna única, gráficos redimensionando. Media queries e ajustes de layout em `web/src/App.css` e nos componentes (`PortfolioDashboard.tsx`, `OperationsList.tsx`, `OperationForm.tsx`, `AuthPage.tsx`, `AdminPage.tsx` etc.). NÃO editar `web/src/index.css` (reservado à T-001).
- **Fora de escopo**: troca de paleta/cores (T-001); framework CSS novo; mudança de funcionalidade.
- **Critério de aceite**: telas legíveis e operáveis em 360px, 768px e desktop sem overflow horizontal da página; `pnpm --filter vetor-wallet-web build` sem erro. Justificativa de teste: mudança de estilo/layout — política do CLAUDE.md dispensa teste novo; web ainda sem runner (issue #6).
- **Resultado**: 8 arquivos alterados: `App.css` (antes órfão, agora importado em `main.tsx`) com safety-net `overflow-x: hidden` global e media query do WalletSelector; formulários (`OperationForm`, `AlertsPanel`) em coluna única no mobile; chip da carteira ativa truncado no header (`App.tsx`); `AdminPage` empilha data+botão; `CsvImport` com `flex-wrap`. Tabelas do dashboard/operações já rolavam em container próprio (verificado pelo revisor). `index.css` intocado (sem conflito com T-001). Build ok. Revisor: APROVADA; risco remanescente: `overflow-x: hidden` global pode mascarar overflow futuro — recomendado teste manual em navegador (360/768px) antes do merge.
