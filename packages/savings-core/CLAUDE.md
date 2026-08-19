# CLAUDE.md — @vetor-wallet/savings-core

Regras de poupança/reserva do Vetor Wallet. Extraído de
`packages/rest-api/src/api/services/savings.ts` na T-099b (Ciclo 19 —
arquitetura em módulos). Categoria **Core**, módulo **Savings** (ver
`docs/MODULES.md`/`docs/PACKAGES.md`). É dono da tabela `savings_entries`.
Hoje o package é **100% puro** (só aritmética de centavos): a metade que falava
com o banco era `goals.ts`, que saiu com Metas na T-091b1.

Este arquivo substitui `docs/decisions/savings-goals.md` (hoje um stub apontando
para cá — e o registro da remoção de Metas) e cobre o módulo Savings inteiro,
incluindo o que vive nas rotas do `rest-api` e nas telas do `web`.

## Metas foi removida do app (T-091b1, 2026-08-14)

Decisão do humano: **Metas some sem substituto** — nem caixinha de Renda Fixa,
nem migração de dado, nem tela nova. Saíram deste package `goals.ts` (progresso
manual × derivado, T-024) e toda a aritmética de reserva/transferência
(`sumReservedByGoal`, `computeReservedTotal`, `computeFreeBalance`,
`pickTransferLegs`, T-041/T-052).

A **etapa 2 (T-091b2, 2026-08-18) já rodou**: a tabela `goals`, a coluna
`savings_entries.goal_id` e o índice `idx_savings_entries_goal` foram **apagados**
do banco (migração `dropGoalsSchema` em `packages/db/src/migrations.ts`; decisões
em [`docs/decisions/db-schema.md`](../../docs/decisions/db-schema.md)). Consequência
prática ao mexer aqui: **não existe mais vínculo com meta em lugar nenhum**, nem em
base antiga. O único legado que sobrou é `savings_entries.transfer_group` (T-041),
que é procedência para o selo `⇄` da UI — perna de par legado é lançamento comum e
conta integral no saldo.

## Estrutura

```
src/
├── savings.ts  # PURO: toCents, computeBalance
└── index.ts    # barrel
```

Rota: `packages/rest-api/src/api/routes/savings.ts`. Telas e lógica pura
do cliente: `packages/web/src/routes/{savingsProjection,savingsWithdraw}.ts`
(e `savingsTransfer.ts`, hoje só o selo de procedência do dado legado).

## Invariantes (não quebrar)

- **Saldo livre = saldo.** Não existe mais reserva: `computeBalance` é o único
  número, e quem precisa dele no cliente lê `summary.balance` do server em vez de
  derivar. A função `computeFreeBalance` foi **removida** em vez de virar
  identidade — um segundo nome para o mesmo valor convida a divergência.
- **Lançamento legado conta INTEGRAL no saldo.** Nada é descontado por causa de
  rótulo de procedência: hoje isso significa `transfer_group` (T-041), e tem teste
  aqui e na rota. Até a T-091b2 o caso era o `goal_id`, que deixou de existir.
- **Toda soma de dinheiro aqui é em centavos inteiros** (`toCents` =
  `Math.round(v * 100)`): somar floats direto faz `0,10 + 0,20` virar
  `0.30000000000000004` e diverge um centavo do `summary` em razões grandes.
- **Não importa `express`** nem nada de `rest-api`/`web` (regra 1 de
  `docs/PACKAGES.md`).

## Previsão de rendimento da poupança é client-side (T-040)

O card "Previsão de rendimento" em `/poupanca` simula quanto o dinheiro rende num prazo escolhido pelo usuário. **Nenhum endpoint novo**: tudo é calculado no browser por funções puras em `packages/web/src/routes/savingsProjection.ts` (testadas em `savingsProjection.test.ts`), e a simulação **não é persistida**.

- `projectSavings(initial, monthlyRatePct, months, monthlyContribution?)` → `{ futureValue, totalYield, totalContributed }` por juros compostos mensais, arredondados em centavos sem divergência entre si (`round((inicial + totalContributed + totalYield)*100) === round(futureValue*100)` — igualdade estrita em float não vale para valores grandes; testes devem comparar em centavos). Devolve `null`, em vez de `NaN` na tela, para entrada não finita, negativa, `months` não inteiro ou resultado que estoura `number`. `months = 0` e taxa `0` são entradas **válidas** (rendimento 0).
- **Aporte mensal recorrente (T-062)**: `monthlyContribution` é o 4º parâmetro, **opcional com default `0`** — omitir reproduz exatamente o comportamento pré-T-062 (retrocompatibilidade coberta por teste). A fórmula é a da **anuidade ordinária** (aporte no **fim** de cada mês): `VF = VP × (1 + i)^n + A × ((1 + i)^n − 1)/i`, com caso especial `i = 0` → `VF = VP + A × n` (sem o ramo, `0/0 = NaN`). A convenção do fim do mês é a conservadora das duas e corresponde a quem aporta com a sobra do mês; a antecipada multiplicaria o termo do aporte por `(1 + i)` e produziria um valor futuro maior. Consequência visível (com teste): num prazo de 1 mês o único aporte não rende nada. **Aporte negativo/não finito → `null`** (aporte negativo seria retirada mensal, cenário que o simulador não promete modelar), `0` é válido. A mesma assinatura, fórmula e convenção valem para `projectPortfolio` (T-056) e `buildProjectionSeries` (T-057b) — os três mudam juntos.
- **Semântica do ganho/rendimento com aporte**: `totalYield = VF − VP − A × n` — os aportes do usuário **não** são rendimento. `totalContributed` (`A × n`, arredondado em centavos) é devolvido pela própria função para a UI não recalcular, e as duas telas exibem um sublabel em cada card ("Inclui R$ X aportados no período" / "Só os juros — os R$ X aportados não contam como rendimento"): sem isso o número do rendimento parece errado ao lado do valor futuro.
- `deriveMonthlyRatePct(entries)` pré-preenche o campo de taxa a partir do histórico. Heurística: agrupa os `YIELD` por mês, divide o rendimento do mês pelo **saldo no início daquele mês** (`DEPOSIT + YIELD − WITHDRAW` das datas anteriores ao dia 1 — usar o saldo inicial evita que o próprio rendimento ou um aporte no meio do mês achate a taxa), descarta meses com base ≤ 0 e devolve a média aritmética dos até `RATE_SAMPLE_MONTHS` (6) meses elegíveis mais recentes, em pontos percentuais com 4 casas. Histórico insuficiente → `null`, e a UI deixa o campo vazio com placeholder. Sem teto: uma taxa atípica é exibida (o campo é editável) em vez de mascarada.
- Os inputs aceitam vírgula decimal. `parseMoneyInput` de `inlineEdit.ts` **não** serve aqui porque rejeita `0`, que numa simulação é legítimo — daí `parseNonNegativeInput`/`parseMonthsInput` no mesmo arquivo da projeção. O campo de aporte (T-062) reusa `parseNonNegativeInput` (nenhum parser novo), mas as duas telas tratam o **texto em branco como `0`** antes de chamá-lo: `parseNonNegativeInput('')` devolve `null` igual a lixo digitado, e um campo opcional vazio não deve invalidar a projeção. O aporte não tem default derivado — nasce vazio e por isso fica **fora** do `simTouched`.
- Os defaults (valor inicial = saldo do `summary`, taxa = derivada) chegam depois do fetch, então são aplicados por efeito **só enquanto o usuário não tocou no campo** (`simTouched`) — digitar não é sobrescrito pelo refetch. `formatDecimalInput(valor, casas)` formata esses defaults com vírgula decimal (2 casas para o valor inicial, 4 para a taxa derivada — mesma resolução de `deriveMonthlyRatePct`), consistente com o que `parseNonNegativeInput` aceita de volta (T-047).
- **`initial === 0` é curto-circuitado** em `projectSavings`, antes da potência: sem isso, taxa e/ou prazo extremos fariam `Math.pow` estourar para `Infinity` e `0 × Infinity = NaN` devolveria `null` para uma simulação (saldo zerado) perfeitamente válida (T-047). **Desde a T-062 o curto-circuito exige `monthlyContribution === 0` também**: "parto do zero e aporto X por mês" é simulação legítima com valor futuro positivo, e curto-circuitá-la para zeros seria resultado errado (não só uma otimização perdida). Com aporte > 0 o caminho normal roda e o estouro de `number` volta a devolver `null` — ambos os ramos têm teste, aqui e em `projectPortfolio`.
- **O mês corrente é excluído da amostra de `deriveMonthlyRatePct`** (T-047): seu rendimento é parcial (o mês ainda não fechou) e entraria como uma taxa artificialmente baixa, achatando a média dos meses fechados.
- Sem gráfico (decisão do humano) e sem comparação com CDI/Ibovespa (fora de escopo).

## Aviso não-bloqueante de saque acima do saldo (T-079)

O server aceita `WITHDRAW` acima do saldo da poupança — permissividade intencional, sem regra de negócio que proíba (fora de escopo mudar). Antes da T-079 a UI ficava muda: um erro de digitação (ex.: saque de R$ 99.999 com saldo de R$ 5.042) passava sem qualquer aviso e deixava o saldo negativo em silêncio.

- `wouldOverdrawBalance(amount, balance)` em `packages/web/src/routes/savingsWithdraw.ts` (com teste ao lado) só responde **se avisa** — comparação em centavos inteiros (padrão T-041/T-052); sacar exatamente o saldo **não** é excedente e não pede confirmação.
- Passo de confirmação **inline no form** de "Novo lançamento" (`PoupancaPage.tsx`), não `window.confirm`: a página ainda não tinha um padrão de confirmação próprio, e um passo inline é mais fácil de testar e mais consistente com o resto do form. Ao detectar overdraw num WITHDRAW, o primeiro submit não envia o POST — só marca `overdrawConfirmPending`, troca o texto do botão para "Confirmar retirada" e mostra um aviso; o segundo submit (com o mesmo valor) segue para a API. Qualquer edição no form depois do aviso (tipo, valor, data, nota) derruba a confirmação pendente — ela vale só para os dados exatos que o usuário viu.
- **Não-bloqueante de verdade**: nenhuma validação nova impede o envio, o aviso só atrasa por um clique extra. O server continua sendo a única autoridade sobre se o saque é aceito.

## CTA de onboarding no card "Poupança" da Home (T-080)

`isSavingsLayerEmpty` (`packages/web/src/routes/homeMetrics.ts`) decide se o card mostra o CTA "Faça seu primeiro aporte →" no lugar do valor. A Home só recebe o agregado `SavingsSummary` (sem a lista de `savings_entries`), então não há como checar "existe lançamento" diretamente como nos demais layers.

- **Proxy adotado**: `totalDeposits === 0 && totalYield === 0 && totalWithdrawals === 0`. Qualquer `DEPOSIT`/`YIELD`/`WITHDRAW` soma um valor > 0 em pelo menos uma dessas três somas, então as três zeradas só ocorrem com zero lançamentos — `balance` sozinho não bastaria (um saque total zeraria o saldo sem esvaziar o histórico).
- `summary === null` (ainda não carregou ou a busca falhou) **não** é tratado como vazio — evita falso positivo (CTA sugerindo uma ação que já foi feita).

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência) e
`docs/MODULES.md` (módulo Savings).
