# TODOs para o humano (Giovane)

> Agentes: registrem aqui tudo que **só o humano pode resolver** — decisões de produto/UX, credenciais e secrets, aprovações de merge/PR, gastos (APIs pagas, infra), mudanças de prioridade.
>
> Formato: item novo no topo da seção "Abertos", com data, agente de origem e tarefa relacionada. Nunca apaguem itens — o humano move para "Resolvidos" com a resposta, e ela vira registro de decisão.

## Modelo de item

```markdown
### [2026-07-19] Título da pendência
- **Origem**: executor (T-003) | orquestrador
- **Bloqueia**: T-003 (ou "nada — apenas informativo")
- **Pergunta/pendência**: o que precisa ser decidido ou feito, com as opções e trade-offs se houver
- **Resposta do humano**: _(preencher)_
```

---

## Abertos

### [2026-07-24] Onda A completa — decidir estratégia de integração antes da Onda B
- **Origem**: orquestrador (ciclo 2)
- **Bloqueia**: Onda B (T-005, T-007) e todas as seguintes
- **Pergunta/pendência**: T-003, T-004 e T-006 estão concluídas e APROVADAS pelo revisor, cada uma na própria branch. A Onda B depende do código delas, e executores partem da `main`. Opções: **(a)** aprovar merge das 3 branches na `main` agora (orquestrador abre as PRs; nota: T-003+T-004 juntas mudam o visual/navegação da main imediatamente); **(b) [recomendada]** autorizar branch de integração `v4-integracao` — orquestrador consolida as 3 branches nela (resolvendo o conflito conhecido do stub de tema T-004 × `theme.ts` T-003), executores das próximas ondas partem dela, e a `main` só recebe o v4 completo no fim do ciclo, numa única revisão final sua.
- **Resposta do humano**: (via chat, 2026-07-24) opção (a), com autorização **permanente**: orquestrador sempre abre as PRs e faz o merge automático delas, resolvendo conflitos; revisão humana a posteriori. Perguntas operacionais de integração não bloqueiam mais o loop. Executado: PRs #47, #48, #49 mergeadas na `main`; conflito de tema reconciliado (`f3a555d`); suíte (92 testes) e build verdes na `main`.

### [2026-07-24] Modelagem dos novos layers (renda/despesas/poupança/metas) — decisões do orquestrador
- **Origem**: orquestrador (ciclo 2, T-006/T-007)
- **Bloqueia**: nada — apenas informativo; contestável antes da execução
- **Pergunta/pendência**: o handoff de design não define modelo de dados (e afirma incorretamente que o backend já existe). Defaults adotados: (a) registros dos layers pertencem ao **usuário**, sem vínculo com `wallet_id` (carteiras seguem sendo só de ações); (b) renda e despesas são **valores mensais fixos cadastrados** (fontes/itens), não lançamentos datados; (c) poupança é um **livro de lançamentos** (DEPOSIT/WITHDRAW/YIELD) com saldo derivado; (d) metas têm `current_amount` atualizado manualmente. Contestar qualquer default aqui antes de aprovar merge das T-006/T-007.
- **Resposta do humano**: _(preencher)_

### [2026-07-24] Destino de Alertas, Import CSV e Comparativo CDI/Ibovespa no design v4
- **Origem**: orquestrador (ciclo 2, T-013)
- **Bloqueia**: nada por ora — T-013 mantém os arquivos e rotas, só remove gráficos da UI
- **Pergunta/pendência**: o protótipo v4 não prevê lugar para AlertsPanel, CsvImport nem BenchmarkComparison no dashboard. Opções: (a) mantê-los no dashboard em cards abaixo do form, adaptados ao visual novo; (b) escondê-los neste ciclo e redesenhar depois; (c) descontinuar comparativo/gráficos de vez. T-013 seguirá com (a) para alertas/import e removerá só os gráficos, salvo resposta diferente.
- **Resposta do humano**: _(preencher)_

### [2026-07-24] Antiga prioridade 2 (métricas reais nos gráficos) ficou obsoleta?
- **Origem**: orquestrador (ciclo 2)
- **Bloqueia**: nada — define backlog futuro
- **Pergunta/pendência**: o design v4 remove os gráficos de evolução/sparklines do dashboard, tornando a prioridade "métricas reais nos gráficos" sem objeto. Confirmar cancelamento ou indicar onde os gráficos voltam no futuro.
- **Resposta do humano**: _(preencher)_

### [2026-07-19] Aprovar paleta 60-30-10 (T-001)
- **Origem**: orquestrador (relato do executor da T-001)
- **Bloqueia**: merge da PR [#44](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/44)
- **Pergunta/pendência**: proposta do executor é **manter a paleta atual**, que já segue 60-30-10 — 60% canvas `#0f0e0b` (dark) / `#f4efe5` (light); 30% cards/superfícies/navegação; 10% destaque areia `#e3d5b8` (dark) / `#a8814f` (light), mantido por já ser a identidade da marca. Nenhum valor de cor mudou; o diff apenas documenta os papéis em `web/src/index.css`. Aprovar?
- **Resposta do humano**: _(preencher)_

### [2026-07-19] Decidir escopo do "redesign" da prioridade 1
- **Origem**: orquestrador (ressalva do revisor na T-001)
- **Bloqueia**: nada — define o próximo ciclo
- **Pergunta/pendência**: o revisor apontou que a T-001 cumpre o critério da tarefa mas não constitui um redesign visual de fato (o tema já estava em 60-30-10). Opções: (a) dar a parte de cores da prioridade 1 como satisfeita com a paleta atual documentada, ou (b) abrir tarefa de redesign real (novos tons/contraste/proporções) no próximo ciclo.
- **Resposta do humano**: _(preencher)_

### [2026-07-19] Teste manual em navegador antes do merge da T-002
- **Origem**: orquestrador (recomendação do executor e do revisor da T-002)
- **Bloqueia**: merge da PR [#45](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/45)
- **Pergunta/pendência**: validar dashboard, operações, auth e admin em 360px e 768px (devtools responsivo). Executor e revisor validaram por análise estática + build; não houve renderização real em navegador.
- **Resposta do humano**: _(preencher)_

### [2026-07-19] Aprovar merge das PRs #44 (T-001) e #45 (T-002)
- **Origem**: orquestrador
- **Bloqueia**: integração do ciclo 1 na `main`
- **Pergunta/pendência**: ambas revisadas e APROVADAS pelo revisor; orquestrador não faz merge sem aprovação humana.
- **Resposta do humano**: _(preencher)_

## Resolvidos

_(o humano move itens respondidos para cá — histórico de decisões do projeto)_
