# TODOs para o humano (Giovane)

> Agentes: registrem aqui tudo que **só o humano pode resolver** — decisões de produto/UX, credenciais e secrets, aprovações de merge/PR, gastos (APIs pagas, infra), mudanças de prioridade.
>
> Formato: item novo no topo da seção "Abertos", com data, agente de origem e tarefa relacionada. Nunca apaguem itens — o humano move para "Resolvidos" com a resposta, e ela vira registro de decisão.
>
> **Limpeza de 2026-11-08** (a pedido do humano): removidos os itens já respondidos/entregues/arquivados — o registro de cada decisão continua no histórico do git e nas PRs mergeadas. Ficaram só os que seguem sem resposta e ainda importam.

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

### [2026-11-04] T-116c (migração AWS, fatia `bank-import-core`): `wipeUserFinancialEntries` perde atomicidade ao trocar `db` por `query` — deixado em `db.batch`
- **Origem**: executor (T-116c, passo 5, troca `db`→`query`)
- **Bloqueia**: nada da T-116c em si — o resto do package migrou; só esta função segue com `db: Db`. Bloqueia apenas o fim da migração do `bank-import-core` (o package ainda depende de `@vetor-wallet/db` por causa dela).
- **O que achei**: o modo `replace` da Pluggy apaga `income_entries`, `expense_entries` e `savings_entries` do usuário num `db.batch([...], 'write')` atômico — decisão da T-089b: ou apaga os três ou nenhum (meio caminho deixaria um mês negativo inventado, sem desfazer). O `Query` não oferece atomicidade equivalente: não tem `batch` nem transação interativa por proxy, e a alternativa de instrução única com CTE (`WITH a AS (DELETE ...), b AS (DELETE ...) ...`) roda em Postgres mas **o SQLite rejeita escrita dentro de `WITH`** (mesmo achado de `createRecurringExpenseEntry` e `materializeRecurringExpenses`). Três `query()` sequenciais deixariam a janela "despesas apagadas, rendas não" numa operação destrutiva sem volta — não apliquei.
- **O que fiz nesta fatia**: `wipeUserFinancialEntries.ts` ficou **intocado** (`db: Db`, `db.batch`, teste real contra SQLite); a rota `pluggy.ts` continua passando `db` a ele e `query` às demais funções do package. Quando o Postgres estiver no ar a função vira a CTE única (atômica por natureza), sem pergunta nova.
- **Opções**: 1️⃣ aceitar chamadas sequenciais (não recomendo: destrutivo, sem rede); 2️⃣ deixar em `db`/`db.batch` até o Postgres (o que está feito, mesmo precedente do `expenses-core`).
- **Resposta do humano**: _(preencher — default adotado: 2️⃣)_

### [2026-10-16] Renda Fixa (T-091c/d): 4 decisões que NÃO bloqueiam a fatia 1, mas vão travar fatias futuras
- **Origem**: spike de design (Plan/Opus) da T-091c/d
- **Bloqueia**: nada agora — a c1/c2/c3 (parte manual) e a d1/d2/d3 rodaram sem elas. **d4 não roda sem a P3.**
- **P3 — a Renda Fixa entra no patrimônio total da Home?** E se o detector achar uma possível sobreposição com a T-089e (ex.: caixinha que aparece como conta `BANK` E como investimento `CDB`), exclui automático ou só avisa? Depende de rodar o diagnóstico (fatia d1, já entregue — `pnpm --filter vetor-wallet-cli pluggy:investments`) contra o payload real primeiro.
- **P4 — ações de OUTRAS corretoras que a Pluggy também devolve em `/investments`** (tipo `EQUITY`): recomendação é **deixar de fora por enquanto**, só contar e avisar ("sua conexão tem N investimentos de outros tipos que ainda não aparecem aqui") — misturar com as operações manuais da B3 duplicaria quem já lança na mão a mesma corretora conectada. Reconciliar isso é candidata própria, mais para frente.
- **P6 — quem já lançou a caixinha do banco na Poupança** (antes de a Renda Fixa existir) vai contá-la duas vezes ao cadastrar em RF ou conectar a Pluggy. Não dá para migrar automaticamente sem adivinhar qual lançamento de poupança é "na verdade" uma caixinha — a saída sugerida é um texto de orientação na página de RF, não código. Confirma ou quer outra abordagem?
- **Resposta do humano**: _(preencher — P3 pode esperar o diagnóstico real, P4/P6 só quando d4 chegar)_

### [2026-10-15] Agente de insights de ações/cripto: informativo, nunca consultivo
- **Origem**: orquestrador (conversa com o humano sobre os próximos passos da AWS)
- **Bloqueia**: nada hoje — candidata no `BACKLOG.md`, depende da fase 3 de `plano-migracao-aws.md` (onde o cron Lambda vai rodar).
- **O desenho combinado**: um cron Lambda diário grava o snapshot da posição do usuário (ações + cripto); uma rota do `rest-api` lê esse snapshot e devolve observações em linguagem natural sobre a carteira.
- **A trava, decidida e para não reabrir sem nova decisão do humano**: o agente é **informativo, nunca consultivo**. Pode dizer o que os dados mostram sobre a carteira do próprio usuário — concentração ("68% do seu patrimônio em renda variável está num único ativo"), comparação com benchmark (CDI/Ibovespa), ausência estrutural ("você não tem posição em renda fixa"), conteúdo educativo genérico sem citar ticker. **Nunca** recomenda comprar/vender um ativo específico, nem sugere alocação-alvo. Se o usuário perguntar direto "o que eu devo comprar?", o agente recusa e explica por que não é credenciado para isso.
- **Por quê**: recomendação personalizada de investimento é regulada pela CVM (consultor de valores mobiliários exige credenciamento); o humano levantou a dúvida, e a régua acima é o que mantém o agente do lado informativo da linha sem deixar de ser útil.
- **Duas decisões de engenharia junto**: (1) **função determinística antes de LLM onde der** — cálculo de concentração/comparação com benchmark é matemática, não precisa de IA; o LLM entra só para costurar a narrativa em linguagem natural (ideia do humano, para não gastar token à toa); (2) **MCP fica para depois** — só faria sentido se outro consumidor (CLI, outro app) precisasse falar com o mesmo agente; hoje a chamada seria direta do SDK do Claude na rota, com o snapshot no prompt.
- **Resposta do humano**: concordou com o desenho informativo e com adiar MCP; a ideia de preferir função a LLM é dele. _(a entrar na fila quando a fase 3 da AWS chegar)_

### [2026-08-12] Contrato pago com a Pluggy — bloqueia ENTREGAR a T-089, não construí-la
- **Origem**: orquestrador (levantado ao especificar a T-089, a pedido do humano por um botão de conexão no app)
- **Bloqueia**: **ligar a T-089 para terceiros**. Não bloqueia escrever o código, nem o uso pessoal do humano.
- **Pergunta/pendência**: o humano decidiu (via chat, 2026-08-12) que a integração é **produto multi-usuário** — cada usuário conecta o próprio banco por um botão, liberado pelo plano. O conflito: o **Meu Pluggy / conector 200 é gratuito só para uso pessoal**. A própria Pluggy é explícita — uso comercial, múltiplos CPFs ou "virar produto" exige plano pago. **O que precisa do humano**: ver os planos em https://www.pluggy.ai/precos, decidir se o custo mensal se justifica antes de haver usuários pagantes, e fechar o contrato — ou manter a integração como uso pessoal e não vendê-la como feature de plano.
- **Resposta do humano (2026-08-12)**: mitigação por env (`ENVIRONMENT=Staging` liberava, `Production` bloqueava) — enquanto não havia deploy, nada era oferecido a terceiro sem violar nada.
- **Atualização (2026-11-08)**: essa mitigação **saiu do código** — `isPluggyIntegrationEnabled()` agora sempre devolve `true` (não há deploy de produção hoje, então travar por env só atrapalhava o dev local; ver `packages/pluggy-core/CLAUDE.md`). **Isto reabre a urgência deste item**: a partir do primeiro deploy real, não existe mais nenhuma trava de código impedindo terceiros de usar a integração — o contrato **tem** de estar fechado (ou a integração revertida para uso pessoal) antes desse deploy, não depois.
