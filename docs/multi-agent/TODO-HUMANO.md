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

### [2026-08-18] O login do app agora depende do Cognito — preencha o `.env` antes de usar (T-106, #169)
- **Origem**: orquestrador (fechamento da T-106)
- **Bloqueia**: **o seu login**. O server sobe e a migração da T-091b2 roda normalmente, mas `/api/auth/*` responde **503 `AUTH_UNAVAILABLE`** enquanto as variáveis não estiverem no `.env`. Isso é fail closed de propósito, não bug.
- **A sequência para voltar a entrar no app** (nesta ordem):
  1. No user pool, no **app client**, habilite o fluxo **`ALLOW_USER_PASSWORD_AUTH`**. Sem isso a AWS recusa o login e a rota devolve 502.
  2. Preencha em `packages/rest-api/.env`: `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` e — **só se** o app client tiver secret — `COGNITO_CLIENT_SECRET`. Modelo em `.env.example`. **Nunca commite esses valores**: o repo é público.
  3. `pnpm dev` (é aqui que o `DROP` da T-091b2 acontece — ver o item dela).
  4. Cadastre-se **com o mesmo e-mail de hoje**. É esse registro que cria a sua identidade no pool; o app vincula o usuário do Cognito à sua conta existente e **os seus dados continuam lá**.
  5. **Verifique o e-mail no Cognito.** Isto não é opcional: o vínculo com a conta antiga só acontece com `email_verified = true`. Enquanto não estiver verificado, o app responde **403 `EMAIL_NOT_VERIFIED`** — e isso é a trava que impede um terceiro que saiba o seu e-mail de assumir a sua carteira (o buraco que o revisor pegou e que a #169 fechou).
- **Se o vínculo legítimo for recusado mesmo com o e-mail verificado**: o parser aceita `email_verified` só como a string `"true"`. Se o seu pool devolver outro formato, a saída é **verificar/ajustar no pool**, nunca afrouxar o gate — está documentado em `packages/cognito-core/CLAUDE.md`. Me chame e eu ajusto o parser com o formato real na mão.
- **A decisão sobre a confirmação de e-mail continua sua, e agora custa menos**: o backend cobre os dois mundos (`POST /api/auth/confirm` e `/resend-code` existem). Se você escolher manter a confirmação por código, falta só a **tela** de digitar o código no web — é tarefa pequena e eu abro quando você disser. Se auto-confirmar ou desligar a verificação no pool, atenção: **o gate de vínculo continua exigindo e-mail verificado**, então auto-confirmar o cadastro não basta para vincular a conta antiga.
- **Resposta do humano**: _(preencher)_

### [2026-08-18] Subir o server uma vez para o `DROP` de Metas acontecer no seu banco (T-091b2, #168)
- **Origem**: orquestrador (fechamento da T-091b2)
- **Bloqueia**: nada — informativo, mas é o único passo que só você pode dar.
- **O que está feito**: a T-091b2 mergeou em #168 com a migração de rebuild. **O seu `wallet.db` ainda não mudou** — a migração roda no `initDb()`, ou seja, no **próximo `pnpm dev`**. Quando você subir, `goals` e `savings_entries.goal_id` somem de vez e não voltam nos boots seguintes.
- **O backup existe e está fora do repo**: `C:\Users\giovane\Desktop\vetor-wallet-backups\` tem a cópia byte a byte do `wallet.db` de antes (`wallet-pre-t091b2-2026-08-18.db`) e o export das metas (`goals-dump-2026-08-18.json`). **Não delete essa pasta** — ela é a única reversibilidade que existe. Também não a mova para dentro do repo: ele é público.
- **O que o dump revelou, e diminui o risco**: eram **2 metas e nenhum aporte vinculado**, e a sua tabela de poupança está vazia. O rebuild vai copiar zero linhas.
- **O que conferir depois de subir**: a Home e a Poupança abrem sem erro, e o saldo da poupança mostra o mesmo número de antes. Se algo estiver errado, pare o server e me diga **antes** de lançar coisa nova — restaurar é copiar o arquivo de backup de volta, e isso só vale enquanto você não tiver gravado dado novo em cima.
- **Resposta do humano**: _(preencher)_

### [2026-08-18] Dados do user pool do Cognito e a política de confirmação de e-mail (T-106)
- **Origem**: orquestrador (T-106, pedida por você no chat de 2026-08-18)
- **Bloqueia**: **entregar** a T-106, não construí-la. O código, os testes e o fallback dá para fazer sem nada disso; provar que o login real funciona contra o seu pool, não.
- **O que eu preciso, e só você tem** (tudo vai para `packages/rest-api/.env`, **nunca para o repo** — é público):
  - `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` e, **se** você marcou "generate a client secret" ao criar o app client, `COGNITO_CLIENT_SECRET`. O secret muda o código (obriga o `SECRET_HASH` em toda chamada), então diga qual dos dois casos é o seu.
  - No app client, o fluxo **`ALLOW_USER_PASSWORD_AUTH`** precisa estar habilitado. É ele que permite o nosso backend trocar e-mail+senha por token; sem ele, o `InitiateAuth` responde erro e o login não sai do lugar. (A alternativa, `ADMIN_USER_PASSWORD_AUTH`, exigiria credencial IAM no servidor — mais peça para guardar.)
- **A decisão que eu não tomo por você**: por padrão o Cognito **exige confirmação do e-mail por código** antes do primeiro login. Isso muda o cadastro do app:
  1. **Manter a confirmação** — o registro passa a ter uma segunda tela ("digite o código que chegou no e-mail"). Mais trabalho na T-106 e o fluxo fica igual ao de app de verdade.
  2. **Auto-confirmar** — o backend confirma a conta na hora (o usuário entra direto, como hoje). Mais simples e igual ao comportamento atual, mas ninguém prova que o e-mail existe.
  3. **Desligar a verificação no pool** e resolver depois.
- **Resposta do humano**: _(preencher)_

### [2026-08-14] ~~Confirmar o `DROP` do dado de Metas~~ — AUTORIZADO em 2026-08-15 (T-091b2)
- **Origem**: orquestrador (etapa 2 da remoção decidida em 2026-08-14)
- **Bloqueia**: T-091b2 — e **só ela**. A fila segue com a T-104b, que não depende disto.
- **Pendência**: a T-091b1 (#166) tirou Metas da UI e da API **sem apagar nada**. A tabela `goals` e a coluna `savings_entries.goal_id` continuam no seu banco, com as suas metas e os vínculos dos aportes intactos. Enquanto isso valer, desfazer a remoção é reverter código. Depois do `DROP`, **não há como recuperar** — não existe backup do `wallet.db`.
- **O que fazer antes de responder**: rode `pnpm dev`, abra a Home e a Poupança e confira que nada de que você precisa sumiu junto. Um ponto específico para olhar: **o saldo livre da poupança agora é o saldo inteiro** — o dinheiro que estava reservado em metas volta a aparecer como disponível. Se isso não for o que você espera ver, o momento de dizer é **antes** do `DROP`.
- **A pergunta**: apagar `goals` e `goal_id` agora, ou deixar o dado dormindo no banco por enquanto? Deixar não custa nada além de duas colunas mortas — a etapa 2 pode esperar semanas sem prejuízo.
- **Terceira saída, se você quiser guardar**: exportar as metas para um arquivo antes do `DROP` (um `SELECT` para CSV, fora do repo). Diga e eu faço junto da tarefa.
- **Resposta do humano**: (via chat, 2026-08-15) **"adicione nas próximas tarefas esse clear no banco de dados para as metas"** — ou seja, a opção 1️⃣: apagar. A T-091b2 entrou na fila do `BACKLOG.md`, à frente da T-104b.
- **Decisão do orquestrador sobre a 3️⃣ (dump antes do `DROP`)**: ele não escolheu entre 1️⃣ e 3️⃣, então o dump entra **por default**, como passo da tarefa. Custa uma query, o arquivo vai para **fora do repo** (que é público) e devolve a reversibilidade que a decisão custou — sem ele, "apagar agora" é irreversível de verdade, num banco sem backup. Se ele disser que não quer o arquivo, o passo cai.
- **O que ele NÃO confirmou, e por isso fica registrado**: a pendência pedia que ele abrisse o app sem Metas antes de decidir (em especial o saldo livre da poupança, que passou a mostrar como disponível o dinheiro antes reservado). Ele autorizou sem dizer se olhou. O dump cobre o dado; se a **UI** estiver errada, o conserto é código, e nenhuma das duas coisas depende de `goals` existir no banco.

### [2026-08-13] ~~Caixinha herda o papel de Metas, ou Metas some sem substituto?~~ — RESPONDIDO em 2026-08-14 (T-091b)
- **Origem**: orquestrador (levantado ao especificar a T-091, e o humano gostou da leitura)
- **Bloqueia**: a **fase (b)** da T-091 (remover Metas). As fases (a), (c) e (d) seguem sem isso.
- **Contexto**: você decidiu remover o layer de Metas e criar Renda Fixa (com caixinhas) dentro de Investimentos. Só que as duas coisas fazem quase a **mesma** função: uma meta é dinheiro carimbado para um objetivo, com progresso manual ou derivado de aportes vinculados (T-024); uma caixinha é dinheiro carimbado para um objetivo, com **saldo real, rendendo, e chegando sozinho do banco**. Ou seja: caixinha é a versão da meta com dinheiro de verdade.
- **A pergunta, três caminhos**: (a) **caixinha herda** — a caixinha ganha um campo de objetivo/nome e passa a ser "a meta"; quem usava metas migra para caixinhas e o conceito não se perde; (b) **Metas some limpo** — o app deixa de ter objetivos, e caixinha é só posição de renda fixa; (c) **convivem** — caixinha é investimento e Metas continua existindo para objetivos sem dinheiro separado (juntar dinheiro que ainda está na conta). A (c) contradiz a remoção que você pediu, mas é a única que preserva meta sem caixinha correspondente.
- **O que muda na prática**: a (a) exige decidir o que fazer com as metas **já existentes** no seu banco (migrar para caixinha? só arquivar?) e com o par atômico de transferência poupança → meta (T-041). A (b) é a mais simples e a mais destrutiva. A (c) é a menor mudança e deixa a árvore com dois lugares parecidos.
- **Independente disto**, e já decidido: remover Metas vai em **duas etapas** — sumir da UI primeiro, dropar dado depois, com você confirmando entre elas. Nada de `goals` é apagado sem confirmação explícita.
- **Resposta do humano**: (reação 2️⃣ no `#todo-human`, confirmada via chat em 2026-08-14) **opção (b) — Metas some sem substituto.** O app deixa de ter o conceito de objetivo; caixinha é só posição de renda fixa dentro de Investimentos, sem herdar nome/alvo de meta. Sem migração de metas existentes para caixinha.
- **O que isso trava, para não ser reaberto**: (1) nada de `goals` vira caixinha — não há migração de dado entre os dois conceitos; (2) o **saldo livre da poupança** (T-052) deixa de descontar "reservado em metas" e passa a ser o saldo inteiro, mantendo a aritmética em centavos inteiros; (3) o **par atômico** da transferência poupança → meta (T-041) morre junto com a rota `POST /api/savings/transfer-to-goal`, porque não sobra destino.
- **A regra das duas etapas continua valendo** (foi decidida à parte, não pela escolha da opção): a **etapa 1** (T-091b1) tira Metas da **UI e da API** e não apaga uma linha sequer — `goals` e `savings_entries.goal_id` continuam no banco, intactos; a **etapa 2** (T-091b2) é o `DROP` do dado e **só roda com uma confirmação explícita sua**, depois de você ver o app sem Metas. Enquanto a etapa 2 não rodar, voltar atrás é reverter código, não recuperar backup.

### [2026-08-13] A landing anuncia a Pluggy, mas `Production` bloqueia a integração (T-089g)
- **Origem**: executor (T-089g), levantado ao publicar o bloco na página de login
- **Bloqueia**: nada hoje — **vira problema no dia do primeiro deploy**
- **Pendência**: a landing (e a página de Planos, desde antes) anuncia a importação bancária para **qualquer visitante**, inclusive quem ainda não tem conta. Só que o gate `ENVIRONMENT` bloqueia `/api/pluggy/*` fora de `Staging`. Enquanto não há deploy (ver `packages/rest-api/CLAUDE.md` § "Deploy: não existe"), ninguém além de você vê essa página e nada é prometido a terceiro. **No primeiro deploy em produção isso inverte**: a vitrine promete uma feature que a API recusa com 403, e o usuário que se cadastrar por causa dela não vai achar o botão — ele nem aparece, porque a Home lê `enabled` do server.
- **Duas saídas, quando o dia chegar**: (a) expor o `enabled` num endpoint **público** (o `GET /api/pluggy/status` de hoje exige sessão, porque também lista os items do usuário) e a landing condicionar o bloco a ele — o texto some sozinho onde a integração está desligada; (b) tratar isto junto do contrato pago com a Pluggy, que é o que destrava `Production` de verdade (ver o item de 2026-08-12 sobre o contrato). A (b) resolve a causa; a (a) evita a promessa falsa enquanto a causa não é resolvida — e as duas podem coexistir.
- **Por que não foi resolvido agora**: adicionar rota pública só para uma linha de marketing, num app sem deploy e sem visitante, seria construir para um problema que ainda não existe. O registro serve para que a decisão não seja tomada por esquecimento.
- **Resposta do humano**: _(a decidir junto do deploy)_

### [2026-08-12] O modo "substituir tudo" apaga mais do que repõe — leia antes de usar (T-089)
- **Origem**: executor (T-089 fases (b)(c)(d))
- **Bloqueia**: nada — o botão está pronto. É **aviso**, não pendência de decisão.
- **Pendência**: você escolheu (via chat, 2026-08-12) a opção mais destrutiva de `replace`: apagar `income_entries`, `expense_entries` **e** `savings_entries` inteiras antes de importar. Implementado exatamente assim. Duas consequências que só ficaram claras ao construir, e que a tela agora diz antes de confirmar: (1) **a poupança não volta** — a importação da Pluggy grava renda e despesa e **nunca** poupança (movimentação interna nem é importada, T-088), então apagá-la é perda líquida, sem nada no lote de entrada que a recomponha; (2) a Pluggy devolve só a **janela sincronizada** (padrão 30 dias) e apenas das contas conectadas, então histórico mais antigo que isso some e não é reposto. Meta sobrevive, mas progresso derivado de aportes vinculados zera. **Não há desfazer.** Para reduzir o risco de clique acidental, o modal exige digitar `APAGAR` — foi decisão de implementação, não mudança do que você pediu.
- **Se quiser mudar de ideia**: o modo mais estreito (apagar só as linhas `pluggy:*` da janela, preservando manuais) continua sendo uma troca de uma função — diga e eu ajusto.
- **Resposta do humano**: _(nada a fazer; ciente)_

### [2026-08-12] Rodar `pluggy:link` uma vez para seguir sincronizando (T-089a)
- **Origem**: executor (T-089 fase (a))
- **Bloqueia**: nada no código — mas **bloqueia a sua próxima sincronização** até você rodar um comando
- **Pergunta/pendência**: a fase (a) tirou o `itemId` do `.env` e o pôs no banco (`pluggy_items`), por usuário. O `pluggy:sync` **não lê mais `PLUGGY_ITEM_ID`** — ele itera os items do usuário. Como o botão de conexão (fase (c)) ainda não existe, criar a linha é um comando de CLI: `pnpm --filter vetor-wallet-cli pluggy:link` (sem argumento, ele aproveita o `PLUGGY_ITEM_ID` que já está no seu `.env`) e, se quiser, `--connector-id=200 --connector-name=MeuPluggy`. Depois disso o `pluggy:sync --dry-run` volta a funcionar igual. Rodar de novo é seguro (upsert). **Nada foi migrado automaticamente de propósito**: um job que criasse a linha a partir de env presente em runtime transformaria configuração de máquina em dado de usuário. Lembrete que não mudou: a importação real segue **proibida sem `--dry-run`** enquanto a T-088 não decidir movimentação interna.
- **Atualização (2026-08-12, T-089 b/c/d mergeada em #163)**: **o comando deixou de ser o único caminho.** Com o botão na Home, conectar o banco pelo app cria a linha em `pluggy_items` sozinho — é o que a fase (c) resolveu. O `pluggy:link` continua existindo e válido (útil sem subir o app, ou para reaproveitar o `PLUGGY_ITEM_ID` que já está no seu `.env`), mas não é mais obrigatório. Para o botão aparecer, o `packages/rest-api/.env` precisa de `ENVIRONMENT=Staging`, `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
- **Resposta do humano**: (reação ✅ no `#todo-human`, colhida em 2026-08-15) **rodou** — o item está criado em `pluggy_items` e a sincronização segue. A reação estava dada e não tinha sido colhida; foi o primeiro achado do hook de passo 0 (`tools/colher-respostas.mjs`), no dia em que ele passou a existir. **Item encerrado.**

### [2026-08-12] Contrato pago com a Pluggy — bloqueia ENTREGAR a T-089, não construí-la
- **Origem**: orquestrador (levantado ao especificar a T-089, a pedido do humano por um botão de conexão no app)
- **Bloqueia**: **ligar a T-089 para terceiros**. Não bloqueia escrever o código, nem o uso pessoal do humano.
- **Pergunta/pendência**: o humano decidiu (via chat, 2026-08-12) que a integração é **produto multi-usuário** — cada usuário conecta o próprio banco por um botão, liberado pelo plano. O conflito: o **Meu Pluggy / conector 200 é gratuito só para uso pessoal**. A própria Pluggy é explícita — uso comercial, múltiplos CPFs ou "virar produto" exige plano pago. Isso já estava registrado no item de credenciais de 2026-08-02 ("não pode virar produto multi-CPF comercial") e foi reconfirmado na doc em 2026-08-12. Ou seja: **cobrar dos usuários por uma integração construída sobre o tier pessoal gratuito viola os termos da Pluggy** — e é justamente isso que "bloquear conforme o plano do usuário" implica. A T-089 foi especificada de modo a ser construída sem violar nada (modelo por usuário, rotas, UI, gating), com a ligação para terceiros dependendo deste item. **O que precisa do humano**: ver os planos em https://www.pluggy.ai/precos, decidir se o custo mensal se justifica antes de haver usuários pagantes, e fechar o contrato — ou manter a integração como uso pessoal e não vendê-la como feature de plano.
- **Alternativa que não custa nada**: manter o botão atrás de flag desligada (ou visível só para a conta do humano) até haver contrato. O código fica pronto e legal; só não é oferecido.
- **Resposta do humano**: (via chat, 2026-08-12) **a alternativa, com mecanismo próprio**: env nova `ENVIRONMENT` no `rest-api` — valor `Staging` **libera** a integração, `Production` **bloqueia**. Ou seja: o código nasce completo e utilizável por ele em staging, e a integração **não chega a terceiro** sem uma mudança deliberada da regra. Isso **fecha este item na prática** sem gastar nada: enquanto produção bloquear, não há uso comercial do conector 200 e nada é violado. O item fica registrado (não movido para Resolvidos) porque a pergunta original — pagar ou não pela Pluggy — **volta no dia em que ele quiser liberar em produção**; nesse dia, mudar a env não é suficiente, o contrato passa a ser obrigatório.
- **Três decisões de engenharia que o orquestrador travou ao especificar isso** (2026-08-12), porque a regra crua tem furos: (1) **fail closed** — env ausente, vazia ou com valor desconhecido conta como **bloqueado**, nunca liberado: o desfecho de um typo (`Staginng`) não pode ser violar os termos da Pluggy; (2) o gate vive na **rota**, não na UI — esconder o botão é UX, e um botão escondido não é bloqueio nenhum para quem chama a API direto; (3) o web **só lê** o estado via API, sem uma segunda cópia da flag em `VITE_*` — flag duplicada em dois `.env` divergem, e a cópia do cliente é trivialmente burlável.
- **Ambiguidade que vale saber**: o `rest-api` já tem `NODE_ENV` (obrigatória em prod) e `BILLING_ENABLED`. `ENVIRONMENT` é uma **terceira** noção de ambiente e pode divergir das outras duas (`NODE_ENV=production` com `ENVIRONMENT=Staging`, por exemplo). Para o gate da Pluggy, `ENVIRONMENT` é a **única autoridade** — deliberadamente, para não travar o staging dele caso ele rode com `NODE_ENV=production`. Se um dia isso confundir, a saída é unificar, não empilhar uma quarta.

### [2026-08-12] Como tratar movimentação interna na importação (T-088)?
- **Origem**: orquestrador (medido no dry-run real da T-087, com os dados do humano)
- **Bloqueia**: T-088 — e, na prática, **rodar a importação real da T-087 sem `--dry-run`**
- **Pergunta/pendência**: o job está correto e o pipeline funciona, mas os dados reais mostram que importar "como vem" produz um mês irreconhecível. Três defeitos de semântica, medidos no dry-run: (1) **aplicação em reserva** (`Aplicação RDB`) entra como **despesa**, e era a maior parte do volume de débito do mês — a despesa apareceria vários múltiplos acima do gasto real; (2) o **resgate** dessa reserva entra como **renda**; (3) o **pagamento da fatura** do cartão aparece **duas vezes**, como despesa na conta e como renda no cartão. Nada disso é bug do código — é o app não ter o conceito de "movimentação interna". **A boa notícia**: a `category` da Pluggy **vem preenchida** no Meu Pluggy grátis (`Investments`, `Same person transfer`, `Credit card payment`, `Transfers`), então existe sinal limpo para decidir. **Pergunta — três escolhas, podem ser combinadas**: (a) `Investments` vira **lançamento de poupança** em vez de despesa (o app já tem o layer); (b) transferência entre contas próprias e pagamento de fatura **não são importados**; (c) **caixa de entrada de revisão**: nada é gravado sem você aprovar transação por transação. A (c) é a mais completa e a mais cara; (a)+(b) resolvem a quase totalidade do volume medido sem UI nova.
- **Nota de privacidade (2026-08-12)**: este arquivo é **versionado em repo público**. Saldos, valores de lançamento, nomes de estabelecimento e ids de conta/item do humano **não entram aqui** — descreva o defeito de forma relativa ("a maior parte do débito do mês"), nunca com o número. A primeira versão deste item trazia os valores absolutos; foi redigida a pedido do humano.
- **Resposta do humano**: (via Discord `#todo-human`, 2026-08-12) sobre a opção 1️⃣: **"essa parte de investments deve ir pro layer de ações no app (acho que vale uma refatoração pro layer de ações virar um layer de investimentos também)"**. Ou seja: `Investments` **não** vira poupança nem despesa — vira posição no layer de investimentos, e o layer de **Ações** deve ser generalizado para abrigar renda fixa. Isso é maior que a T-088 e virou tarefa própria (ver `BACKLOG.md`): hoje o layer assume ticker da B3 + preço médio + cotação da brapi, e "Aplicação RDB" não tem ticker nem cotação.
- **Resposta do humano, parte 2** (via chat, 2026-08-12): escolhida a opção 2️⃣ — **transferência entre contas próprias e pagamento de fatura não são importados**, usando a `category` da Pluggy como sinal. A 3️⃣ (caixa de entrada de revisão) foi **descartada por ora** e segue em Candidatas no `BACKLOG.md`.
- **Implementado na T-088** (2026-08-12): as três categorias (`Same person transfer`, `Credit card payment`, `Investments`) saem como desfecho `internal` no relatório e nunca chegam ao banco. Duas decisões de engenharia que o executor travou porque a regra crua tem furo: (1) **`Transfers`, a guarda-chuva da Pluggy, ficou FORA da lista** — ela cobre transferência a terceiros, e um PIX pago a alguém é despesa real; pulá-la sumiria com dinheiro de verdade em silêncio; (2) **categoria desconhecida importa normalmente** (fail *open*, ao contrário do gate `ENVIRONMENT`, que falha fechado) — errar para o lado fechado deixaria de importar despesa real, e ausência é invisível para quem confere; errar para o lado aberto produz uma linha que aparece no relatório e pode ser apagada.
- **`Investments` também não é importado**, apesar de a decisão ser mandá-lo para o layer de investimentos: esse layer ainda não existe, e importar como despesa até lá manteria o defeito de maior volume. Nada é gravado, então o `external_id` fica livre — quando o layer existir, resincronizar a mesma janela importa essas linhas.
- **A proibição de rodar sem `--dry-run` CAI para a Pluggy** com esta entrega. Ela **segue valendo para o OFX** (T-085), que não tem campo de categoria e por isso não tem como distinguir movimentação interna.

### [2026-08-09] Executar a T-021 (SELL retroativo aceito e descartado em silêncio)?
- **Origem**: orquestrador (a tarefa estava parada no `BACKLOG.md` como "aguarda decisão", que não é lugar de backlog)
- **Bloqueia**: nada — a fila segue com a T-104b
- **Pergunta/pendência**: o bug é real e está **reproduzido com as funções reais do `portfolio-core`**: com 100 PETR4 compradas em 2026-08-01, uma venda de 100 datada em 2026-01-15 (antes da compra) é **aceita** e a posição continua 100 ações. Vende e continua com tudo; a operação aparece na lista e não faz nada. Causa: a rota valida contra a posição de **hoje** (`operations.ts:74-84`), e o recálculo cronológico trunca com `Math.max(0, …)` (`portfolio.ts:20-21`) — dois comportamentos corretos isolados que juntos abrem o buraco. Correção provável: validar a posição acumulada **até a data da venda**. O risco que antes exigia spike foi **medido e descartado** (banco local real: 6 operações, 0 vendas, 0 rejeições — não há dado legado a migrar). Complexidade caiu para **média**, executor Sonnet, sem spike. **Pergunta**: entra na fila depois da T-104b, ou fica parada?
- **Resposta do humano**: (via chat, 2026-08-12) **fica parada** — sem decisão agora. O item segue aberto e o orquestrador **não replaneja em torno dela**; não entra na fila do ciclo 21. **Confirmado pela reação ❌** no `#todo-human`, colhida em 2026-08-15 pelo hook de passo 0: a decisão via chat e a reação dizem a mesma coisa. O bug continua real e reproduzido — a decisão é sobre prioridade, não sobre existir.

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

### [2026-08-02] ~~Credenciais do Meu Pluggy para o job `pluggy:sync` (T-087)~~ — RESOLVIDO em 2026-08-12
- **Origem**: sessão de revisão com o Claude (planejamento do ciclo 16)
- **Bloqueia**: ~~T-087~~ — **nada. Validado ponta a ponta com a API real em 2026-08-12**: as 4 variáveis estão no `.env` local, `POST /auth` responde 200, o item do conector 200 (`MeuPluggy`) está `status=UPDATED`/`execution=SUCCESS`, e `pluggy:sync --dry-run` leu as contas ligadas sem nenhuma rejeição (só transações `PENDING` puladas). A T-087 foi mergeada (#159). O que a validação revelou sobre os **dados** virou a T-088 (item no topo deste arquivo).
- **Atualização (2026-08-12)**: o humano informou que **tem conta e já tem `client_id`/`client_secret`**, e quer "bater os dados". T-087 saiu de BLOQUEADA para EM_ANDAMENTO. Mapa das duas contas, confirmado na doc da Pluggy nesta data — **são contas separadas** e isso não estava registrado aqui antes: (1) `meu.pluggy.ai` é a conta de **consumidor**, onde os bancos são conectados via Open Finance e onde os dados ficam com backup; (2) `dashboard.pluggy.ai` é o portal de **desenvolvedor**, onde o MeuPluggy é adicionado à lista de conectores da aplicação e onde nasce a **Development Application** com `client_id`/`client_secret`; (3) falta o passo que ninguém adivinha: uma **autorização OAuth ligando a conta consumidor à aplicação de desenvolvedor, repetida uma vez por banco conectado** — é ela que produz o `itemId` que o job consulta. Sem o (3), credencial válida devolve zero contas.
- **O que ainda falta do humano**: gravar `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_ID` em `packages/cli/.env` (não versionado — `.gitignore:6`). Valor **nunca** neste arquivo, nem em corpo de PR ou log.
- **Atualização do executor da T-087 (2026-08-12)**: o código está entregue e testado com `fetch` mockado (`pluggy-core` + mapeamento no `bank-import-core` + job `pluggy:sync`), então **nada aqui bloqueia a tarefa**. Para a validação real faltam **quatro** variáveis em `packages/cli/.env` (ver `packages/cli/.env.example`), não três: entrou `PLUGGY_USER_EMAIL` — o e-mail do usuário do app que **recebe** os lançamentos, porque toda tabela filtra por `user_id` e um job não tem sessão HTTP. Sem ela (ou com e-mail que não existe em `users`) o job **falha de propósito**, em vez de escolher um "usuário default" silencioso. Duas notas que a validação real vai encontrar: (1) o passo (3) do mapa acima — a autorização OAuth que cria o `itemId` — é o que decide se o job vê contas; se o `itemId` não existir ou for de outra aplicação, o job para com mensagem apontando para `PLUGGY_ITEM_ID` (não devolve "0 contas, sucesso"); (2) **rode primeiro com `--dry-run`**, que lista tudo o que faria sem gravar nada. Reexecutar é seguro em qualquer ordem — o dedupe da T-084 faz a segunda passagem reportar duplicatas.
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
