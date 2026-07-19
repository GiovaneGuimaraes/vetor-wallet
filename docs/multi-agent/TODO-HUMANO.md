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
