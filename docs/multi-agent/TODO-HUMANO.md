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

### [2026-08-09] Executar a T-021 (SELL retroativo aceito e descartado em silêncio)?
- **Origem**: orquestrador (a tarefa estava parada no `BACKLOG.md` como "aguarda decisão", que não é lugar de backlog)
- **Bloqueia**: nada — a fila segue com a T-104b
- **Pergunta/pendência**: o bug é real e está **reproduzido com as funções reais do `portfolio-core`**: com 100 PETR4 compradas em 2026-08-01, uma venda de 100 datada em 2026-01-15 (antes da compra) é **aceita** e a posição continua 100 ações. Vende e continua com tudo; a operação aparece na lista e não faz nada. Causa: a rota valida contra a posição de **hoje** (`operations.ts:74-84`), e o recálculo cronológico trunca com `Math.max(0, …)` (`portfolio.ts:20-21`) — dois comportamentos corretos isolados que juntos abrem o buraco. Correção provável: validar a posição acumulada **até a data da venda**. O risco que antes exigia spike foi **medido e descartado** (banco local real: 6 operações, 0 vendas, 0 rejeições — não há dado legado a migrar). Complexidade caiu para **média**, executor Sonnet, sem spike. **Pergunta**: entra na fila depois da T-104b, ou fica parada?
- **Resposta do humano**: _(preencher)_

### [2026-08-09] ~~Liberar os 4 canais do Discord~~ — RESOLVIDO no mesmo dia, com uma sobra
- **Origem**: orquestrador (pedido do humano via chat)
- **Bloqueia**: nada — **integração funcionando**
- **Pergunta/pendência**: os 4 canais tinham permissão própria escondendo o bot (403 Missing Access nos quatro, enquanto a categoria pai respondia 200). O humano adicionou o cargo `agentic-bot` em cada canal.
- **Resposta do humano**: (via chat, 2026-08-09) **cargo adicionado**. Validado ponta a ponta em seguida: `post`, `post --embed`, `edit`, `react`, `reactions` (com filtro de bot) e `post --mention --reply-to` funcionando nos 4 canais.
- **Sobra pequena (não bloqueia nada)**: `pin` responde **403 Missing Permissions** (código 50013, não 50001 — o bot vê o canal, só não pode fixar). O cargo tem `MANAGE_MESSAGES` no nível do servidor, mas a permissão adicionada por canal não a inclui. Para as instruções ficarem fixadas no topo: adicionar **Gerenciar Mensagens** ao cargo nos 4 canais, ou fixar as 5 mensagens à mão (dois cliques cada). As mensagens já estão postadas de qualquer forma.
- **`MESSAGE CONTENT INTENT` provado** (2026-08-09): o humano escreveu no `#new-tasks` e o `read --after` devolveu o texto intacto (`content: "mensagem de test"`, `bot: false`). Era o único risco que não dava para descartar sem uma mensagem escrita por ele — com a intent desligada, o texto voltaria vazio **sem erro nenhum**.
- **Nota de segurança**: o token vive **só** em `tools/discord/.env` (não versionado — `.gitignore:6`). Nunca neste arquivo, que é versionado, nem em corpo de PR ou log.

### [2026-08-09] ~~Arte do personagem da marca para o logo (T-020b)~~ — RESOLVIDO no mesmo dia
- **Origem**: orquestrador (feedback do humano sobre o logo entregue na T-020)
- **Bloqueia**: nada — **entregue**. O humano substituiu `logo-vetor-wallet.png` por uma folha de 6 variações de tom e escolheu o **marrom chocolate claro**; o orquestrador recortou e integrou (T-020b CONCLUIDA). Fica registrado abaixo porque o achado técnico vale para qualquer arte futura.
- **Pergunta/pendência**: o humano não gostou da carteira de massinha como logo e pediu um **personagem padrão**, no estilo dos mascotes, **sem ser nenhum dos 6 de layer**. O orquestrador **não tem ferramenta de geração de imagem**, então não consegue produzir arte inédita nesse acabamento. Tentativa feita e descartada: recolorir o mascote da Renda para marrom-couro e recortar em busto — fica legível e na paleta, mas lado a lado é visivelmente o mesmo personagem em outra cor (amostras em `C:\Users\giovane\Desktop\vetor-logo-propostas\`). **Decisão do humano (2026-08-09): ele mesmo gera a arte e o orquestrador integra.**
- **O que o humano precisa entregar**: um arquivo de imagem (PNG/JPG/WEBP, ≥512×512), personagem centralizado com margem. Não precisa recortar fundo nem otimizar. Prompt pronto e especificação completa em `Desktop\vetor-logo-propostas\PROMPT-personagem-logo.txt`.
- **Achado técnico que vale para qualquer arte futura**: os mascotes são de **corpo inteiro** (285×390) e **não sobrevivem ao header**. Reduzidos ao quadrado de 56px, o corpo fica com ~30px e vira borrão. Logo precisa nascer em **enquadramento de busto**. Isso não era óbvio antes de testar — a carteira de massinha funciona a 56px justamente por ser um objeto compacto.
- **Resposta do humano**: _(entregar a arte)_

### [2026-08-02] Credenciais do Meu Pluggy para o job `pluggy:sync` (T-087)
- **Origem**: sessão de revisão com o Claude (planejamento do ciclo 16)
- **Bloqueia**: T-087 (o resto da Onda C — T-084/T-085/T-086 — não depende disso)
- **Pergunta/pendência**: criar conta em https://meu.pluggy.ai, conectar as contas bancárias/corretoras via Open Finance (Conector 200), gerar `CLIENT_ID`/`CLIENT_SECRET` no painel e colocar em `packages/cli/.env` (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`). Sem custo — o Meu Pluggy é gratuito para uso pessoal (não pode virar produto multi-CPF comercial). Enquanto isso, o executor da T-087 pode trabalhar com mocks, mas a validação final precisa das credenciais reais.
- **Resposta do humano**: (via chat, 2026-08-08) **conta ainda não criada, "talvez demore um pouco"** — item segue ABERTO e a T-087 segue BLOQUEADA, sem previsão. Não é prioridade; não replanejar em torno dela.

## Resolvidos

### [2026-08-10] Aviso do GitHub: "Your main branch isn't protected"
- **Origem**: humano (via chat)
- **Bloqueia**: nada
- **Pergunta/pendência**: o repositório é **público** e não tinha ruleset nenhum. Como estranhos não conseguem dar push, proteger a `main` aqui é protegê-la **dos próprios agentes**, que rodam git no repo. Dois buracos reais medidos na ocasião: (1) o fluxo mergeia sem esperar o CI — a #154 foi mergeada segundos depois do push; (2) o `pnpm backlog:check` não estava no CI, ou seja, o guard criado para não depender de memória dependia de memória.
- **Resposta do humano**: (via chat, 2026-08-10) nível **mínimo** + guard no CI. Executado: ruleset "main protegida" com `non_fast_forward` e `deletion`; step `Backlog hygiene` no `ci.yml`.
- **Conscientemente aberto**: push direto na `main` e merge com CI vermelho seguem permitidos. O nível completo trocaria o merge instantâneo por `gh pr merge --auto` (espera o CI) e proibiria commit direto de docs/asset. Fica como alavanca se o merge vermelho um dia morder.

### [2026-07-24→2026-08-08] Logo oficial × mascotes no header (T-020)
- **Origem**: orquestrador (ciclo 4; a pergunta ficou parada desde 2026-07-24)
- **Bloqueia**: ~~T-020~~ — **desbloqueado**
- **Pergunta/pendência**: no header do app v4 valem os mascotes por layer (design atual) — a logo oficial entra onde? Só na landing/auth, ou substitui os mascotes?
- **Resposta do humano**: (via chat, 2026-08-08) **logo oficial fixa no header**, no lugar da troca por layer; **os mascotes continuam**, mas nas respectivas pages. Escolhida a apresentação **recorte transparente** (logo "flutua" no header, sem moldura, mesmo arquivo servindo light e dark) entre as três opções apresentadas — as outras eram chip arredondado estilo app icon e só a wordmark.
- **Execução do asset (feita pelo orquestrador, 2026-08-08)**: o `logo-vetor-wallet.png` da raiz do repo é **RGB sem canal alpha**, 1254×1254, 1,7 MB, fundo branco sólido — colocá-lo no header como estava produziria um quadrado branco sobre o canvas escuro. Não há `sharp` nem ImageMagick no ambiente, então o recorte foi feito com `sharp` instalado **fora do repo** (scratchpad), por flood fill a partir das bordas (só remove branco conectado ao fundo, preservando brancos internos do desenho) com rampa de alpha 195→232 nas bordas anti-aliased. O limiar inicial (225→248) deixava halo claro visível a 320% e foi apertado. Resultado conferido **visualmente** sobre os dois fundos de tema antes de aceitar: `packages/web/public/logo.png`, 224×224 RGBA, 25 KB (de 1,7 MB). O PNG original continua na raiz como fonte.

### [2026-08-07] Caminho do entry de produção muda com o rename `server` → `rest-api` (T-100)
- **Origem**: orquestrador (Ciclo 19 — migração para arquitetura em módulos)
- **Bloqueia**: ~~T-100~~ — **desbloqueado em 2026-08-08**
- **Pergunta/pendência**: não há configuração de deploy versionada no repo, então o deploy pareceria estar num painel de hospedagem invisível aos agentes. Onde está configurado o start do server em produção?
- **Resposta do humano**: (via chat, 2026-08-08) **não existe deploy nenhum ainda** — a premissa da pergunta estava errada: não há painel a atualizar porque a API só roda localmente. Decisão: **manter a API testável apenas em local por enquanto**; a migração para **AWS Cloud** está no horizonte, mas **não deve ser feita agora** e não gera tarefa. Consequências: (1) a **T-100 está desbloqueada** — sem entry de produção, o rename não derruba nada; (2) a opção (b) da pergunta (versionar Dockerfile antes do rename) fica **sem objeto por ora** e volta à mesa quando a AWS entrar; (3) nenhum agente deve criar config de deploy, Dockerfile ou pipeline de infra sem pedido explícito.

### [2026-08-01] Credenciais AbacatePay (dev agora, prod depois)
- **Origem**: orquestrador (Ciclo 15 — T-069/T-070)
- **Bloqueia**: nada para o desenvolvimento (executores usam fetch mockado nos testes); bloqueava o **teste real em dev mode**
- **Pergunta/pendência**: (1) criar conta em https://www.abacatepay.com (nasce em Dev Mode), gerar a API key de sandbox e colocar em `packages/rest-api/.env` como `ABACATEPAY_API_KEY`; (2) para produção, futuramente: chave de produção, webhook apontando para `https://<seu-host>/api/webhooks/abacatepay?webhookSecret=<secret>`, `ABACATEPAY_WEBHOOK_SECRET` + `BILLING_ENABLED=true`.
- **Resposta do humano**: (via chat, 2026-08-08) **chave de staging (`abc_dev_…`) fornecida e gravada** pelo orquestrador em `packages/server/.env` — **hoje `packages/rest-api/.env`**, o arquivo
  acompanhou o rename da T-100 e a chave continua lá (arquivo não versionado — `.gitignore:6`; confirmado por `git grep` que nenhum arquivo versionado contém a string). A chave anterior que estava no `.env` local foi substituída. **A parte (2) — produção — continua pendente**, mas sem urgência: como não há deploy (ver item acima), não existe ambiente de produção para configurar. Os preços default (Pro Mensal R$ 9,90 / Pro Anual R$ 99,00) seguem não contestados.
- **Nota de segurança para agentes**: chaves vão **só** para `.env` local. Nunca commitar, nunca escrever o valor neste arquivo (que é versionado), nunca ecoar em corpo de PR ou log.

### [2026-07-25] Custo do multi-agente: revisor volta a ser Sonnet
- **Origem**: humano (via chat, durante o ciclo 12)
- **Bloqueia**: nada — muda o roteamento de modelos
- **Pergunta/pendência**: —
- **Resposta do humano**: "o opus incluido no fluxo deixou o multi agente muito caro, podemos voltar com o sonnet para revisar tambem" → revisor é **sempre Sonnet** a partir de agora (README.md atualizado); executor Opus continua reservado a tarefas de complexidade alta.

### [2026-07-25] Carteira única (T-050): P&L consolidado para base legada com 2+ carteiras
- **Origem**: orquestrador (spike de design da T-050, Plan/Opus)
- **Bloqueia**: nada — default adotado
- **Pergunta/pendência**: com a carteira única, as leituras agregam tudo do usuário; base legada com 2+ carteiras passa a ver o P&L consolidado. Ok?
- **Resposta do humano**: (via chat, 2026-07-25) **"validei o front e as funcoes"** — validação do fluxo de carteira única sem ressalvas; consolidado aceito.

### [2026-07-25] Ciclo 10 aprovado + decisão nova: gráfico e projeções na dash de ações
- **Origem**: orquestrador (proposta do ciclo 10)
- **Bloqueia**: nada — define o ciclo 10
- **Pergunta/pendência**: escopo do ciclo 10 (colheita do ciclo 9 + escolhas de produto).
- **Resposta do humano**: (via chat, 2026-07-25) "pode começar a nova onda, porem adicione tasks para melhorar a parte da dash da carteira de acoes (queria projecoes de ganhos em cima das minhas acoes atuais e algum grafico para melhorar a page)". **Nota**: isso reverte, para a dash de ações, a diretriz de 2026-07-24 de "sem gráficos no dashboard" (que segue valendo para a Home). Extensão do simulador (aporte/CDI) e edição de template de recorrência seguem como candidatas sem decisão.

### [2026-07-25] Ciclo 9 aprovado + decisão: carteira única de ações
- **Origem**: orquestrador (proposta da "próxima onda")
- **Bloqueia**: nada — registro de decisão
- **Pergunta/pendência**: aprovar o Ciclo 9 (colheita das revisões T-043–T-049) e confirmar a simplificação para carteira única sinalizada em 2026-07-24.
- **Resposta do humano**: (via chat, 2026-07-25) **aprovado** iniciar a onda; e decisão nova de produto: "na parte de carteira de ações eu quero remover a lógica que permite o user ter mais de uma carteira no momento, faça isso depois" → virou a T-050, última do ciclo.

### [2026-07-24] Ciclo 3 encerrado — decisões para o ciclo 4
- **Origem**: orquestrador (encerramento do processo a pedido do humano)
- **Bloqueia**: início do ciclo 4
- **Pergunta/pendência**: (1) Ordenar a "Fila do ciclo 4" do `BACKLOG.md` — recomendação do orquestrador: T-019 primeiro (lacuna de corretude: SELL do CSV não valida por carteira), depois T-016 (P&L diário); (2) decidir a T-020: no header do app v4 valem os mascotes por layer (design atual) — a logo oficial entra onde? Só na landing/auth, ou substitui os mascotes?; (3) T-021 (validação de SELL por data histórica) vale o custo?
- **Resposta do humano**: (via chat, 2026-07-24) **não iniciar o novo fluxo/ciclo ainda** — ciclo 4 em espera até nova ordem do humano. (Obs.: T-019 e T-016 já haviam sido executadas e mergeadas — PRs #61 e #62 — antes desta resposta; T-020 e T-021 seguem em espera junto com o resto do ciclo.)

### [2026-07-24] Ciclo 2 concluído — validação visual final do app v4
- **Origem**: orquestrador (fechamento do ciclo 2)
- **Bloqueia**: nada — o app v4 já está na `main` (PRs #47–#56)
- **Pergunta/pendência**: rode `pnpm dev` e navegue o fluxo completo (landing → home → cada layer → carteiras → dashboard) em light/dark e em 360/768px. Revisores validaram por análise estática, build e HTTP — nenhuma captura de tela foi feita. Pontos específicos citados nas revisões: landing em <860px, tabela do dashboard em 360px, hover dos mascotes na home. Divergências visuais viram tarefas residuais no próximo ciclo.
- **Resposta do humano**: (via chat, 2026-07-24) **testado** — validação visual feita pelo humano, sem divergências reportadas.

### [2026-07-24] Candidatas para o próximo ciclo (decisão de prioridade)
- **Origem**: orquestrador
- **Bloqueia**: nada — define o ciclo 3
- **Pergunta/pendência**: candidatas identificadas durante o ciclo 2: (a) P&L diário real nos cards de carteira (derivar de `quote_snapshots` — hoje o chip mostra P&L total rotulado); (b) test runner no web (issue #6 — o workaround de testar funções puras via server funcionou, mas tem limite); (c) dívidas antigas do `ORQUESTRADOR.md` (SELL sem validação de saldo, falha silenciosa de cotações, admin ampliado, logo oficial/favicon — a antiga prioridade 4 não foi tocada no v4); (d) backend de cripto (tela é mock). Ordene ou proponha outras.
- **Resposta do humano**: (via chat, 2026-07-24) **aguardar** a parte de cripto e de ações — o humano quer melhorar as funções básicas do app primeiro. ((a) já foi entregue na T-016 e a validação de SELL na T-019 antes desta resposta.)

### [2026-07-24] Onda A completa — decidir estratégia de integração antes da Onda B
- **Origem**: orquestrador (ciclo 2)
- **Bloqueia**: Onda B (T-005, T-007) e todas as seguintes
- **Pergunta/pendência**: T-003, T-004 e T-006 estão concluídas e APROVADAS pelo revisor, cada uma na própria branch. A Onda B depende do código delas, e executores partem da `main`. Opções: **(a)** aprovar merge das 3 branches na `main` agora (orquestrador abre as PRs; nota: T-003+T-004 juntas mudam o visual/navegação da main imediatamente); **(b) [recomendada]** autorizar branch de integração `v4-integracao` — orquestrador consolida as 3 branches nela (resolvendo o conflito conhecido do stub de tema T-004 × `theme.ts` T-003), executores das próximas ondas partem dela, e a `main` só recebe o v4 completo no fim do ciclo, numa única revisão final sua.
- **Resposta do humano**: (via chat, 2026-07-24) opção (a), com autorização **permanente**: orquestrador sempre abre as PRs e faz o merge automático delas, resolvendo conflitos; revisão humana a posteriori. Perguntas operacionais de integração não bloqueiam mais o loop. Executado: PRs #47, #48, #49 mergeadas na `main`; conflito de tema reconciliado (`f3a555d`); suíte (92 testes) e build verdes na `main`.

### [2026-07-24] Modelagem dos novos layers (renda/despesas/poupança/metas) — decisões do orquestrador
- **Origem**: orquestrador (ciclo 2, T-006/T-007)
- **Bloqueia**: nada — apenas informativo; contestável antes da execução
- **Pergunta/pendência**: o handoff de design não define modelo de dados (e afirma incorretamente que o backend já existe). Defaults adotados: (a) registros dos layers pertencem ao **usuário**, sem vínculo com `wallet_id` (carteiras seguem sendo só de ações); (b) renda e despesas são **valores mensais fixos cadastrados** (fontes/itens), não lançamentos datados; (c) poupança é um **livro de lançamentos** (DEPOSIT/WITHDRAW/YIELD) com saldo derivado; (d) metas têm `current_amount` atualizado manualmente. Contestar qualquer default aqui antes de aprovar merge das T-006/T-007.
- **Resposta do humano**: (via chat, 2026-07-24) defaults aceitos, com uma diretriz nova de produto: **do jeito que o app está hoje, o usuário não precisa de múltiplas carteiras** — uma só resolve, então a page de várias carteiras de ações pode ser dispensada. Candidata a tarefa de simplificação num ciclo futuro (não iniciar agora — ciclo em espera).

### [2026-07-24] Destino de Alertas, Import CSV e Comparativo CDI/Ibovespa no design v4
- **Origem**: orquestrador (ciclo 2, T-013)
- **Bloqueia**: nada por ora — T-013 mantém os arquivos e rotas, só remove gráficos da UI
- **Pergunta/pendência**: o protótipo v4 não prevê lugar para AlertsPanel, CsvImport nem BenchmarkComparison no dashboard. Opções: (a) mantê-los no dashboard em cards abaixo do form, adaptados ao visual novo; (b) escondê-los neste ciclo e redesenhar depois; (c) descontinuar comparativo/gráficos de vez. T-013 seguirá com (a) para alertas/import e removerá só os gráficos, salvo resposta diferente.
- **Resposta do humano**: (via chat, 2026-07-24) opção **(b)** — esconder da UI e redesenhar depois. (Nota: a T-013 foi executada com (a) por default antes desta resposta; ocultar Alertas/Import/Benchmark do dashboard vira tarefa candidata do próximo ciclo.)

### [2026-07-24] Antiga prioridade 2 (métricas reais nos gráficos) ficou obsoleta?
- **Origem**: orquestrador (ciclo 2)
- **Bloqueia**: nada — define backlog futuro
- **Pergunta/pendência**: o design v4 remove os gráficos de evolução/sparklines do dashboard, tornando a prioridade "métricas reais nos gráficos" sem objeto. Confirmar cancelamento ou indicar onde os gráficos voltam no futuro.
- **Resposta do humano**: (via chat, 2026-07-24) **cancelamento confirmado** — prioridade removida do backlog.

### [2026-07-19] Aprovar paleta 60-30-10 (T-001)
- **Origem**: orquestrador (relato do executor da T-001)
- **Bloqueia**: merge da PR [#44](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/44)
- **Pergunta/pendência**: proposta do executor é **manter a paleta atual**, que já segue 60-30-10 — 60% canvas `#0f0e0b` (dark) / `#f4efe5` (light); 30% cards/superfícies/navegação; 10% destaque areia `#e3d5b8` (dark) / `#a8814f` (light), mantido por já ser a identidade da marca. Nenhum valor de cor mudou; o diff apenas documenta os papéis em `web/src/index.css`. Aprovar?
- **Resposta do humano**: (via chat, 2026-07-24) **aprovado** — o design atual está bom; manter a paleta.

### [2026-07-19] Decidir escopo do "redesign" da prioridade 1
- **Origem**: orquestrador (ressalva do revisor na T-001)
- **Bloqueia**: nada — define o próximo ciclo
- **Pergunta/pendência**: o revisor apontou que a T-001 cumpre o critério da tarefa mas não constitui um redesign visual de fato (o tema já estava em 60-30-10). Opções: (a) dar a parte de cores da prioridade 1 como satisfeita com a paleta atual documentada, ou (b) abrir tarefa de redesign real (novos tons/contraste/proporções) no próximo ciclo.
- **Resposta do humano**: (via chat, 2026-07-24) opção **(a)** — o design está bom no momento; sem tarefa de redesign, aguardar.

### [2026-07-19] Teste manual em navegador antes do merge da T-002
- **Origem**: orquestrador (recomendação do executor e do revisor da T-002)
- **Bloqueia**: merge da PR [#45](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/45)
- **Pergunta/pendência**: validar dashboard, operações, auth e admin em 360px e 768px (devtools responsivo). Executor e revisor validaram por análise estática + build; não houve renderização real em navegador.
- **Resposta do humano**: (via chat, 2026-07-24) **testado** pelo humano.

### [2026-07-19] Aprovar merge das PRs #44 (T-001) e #45 (T-002)
- **Origem**: orquestrador
- **Bloqueia**: integração do ciclo 1 na `main`
- **Pergunta/pendência**: ambas revisadas e APROVADAS pelo revisor; orquestrador não faz merge sem aprovação humana.
- **Resposta do humano**: (via chat, 2026-07-24) **pode esperar** — merge das PRs #44/#45 adiado, sem urgência. (Obs.: o conteúdo delas pode já ter sido absorvido pelo redesign v4 na `main`; verificar antes de eventualmente mergear ou fechar.)
