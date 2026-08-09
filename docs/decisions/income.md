# Decisões: renda e Home

### Renda fixa × lançamentos de renda variável (T-036)
O layer `/renda` soma **duas** fontes diferentes, espelhando exatamente o que a T-022 fez em despesas: `income_sources` (fontes fixas mensais, **sem data** — valem integralmente para qualquer mês exibido) e `income_entries` (renda avulsa datada: freela pontual, venda, bônus, filtrada por mês). O **total do mês exibido é fixas + variáveis daquele mês** — calculado por `computeIncomeMonthTotals` em `packages/web/src/routes/incomeMonth.ts` (função pura, testada), não inline no componente. A navegação de mês é estado local da `RendaPage`: trocar o mês recarrega só as rendas variáveis (`GET /api/income-entries?month=`), com a mesma guarda de resposta obsoleta da T-030 (`latestRequestedMonthRef`), pois as fixas não dependem do mês.

Decisões de projeto:

- **Nada de helper de mês duplicado**: `RendaPage` importa `currentMonthKey`/`shiftMonth`/`formatMonthLabel`/`formatDayMonth` de `expenseMonth.ts` — esses helpers não são específicos de despesas. Só o cálculo de total ganhou arquivo próprio (`incomeMonth.ts`), porque os tipos das duas fontes são diferentes. No server, `routes/incomeEntries.ts` importa `currentMonth` de `packages/rest-api/src/api/routes/expenseEntries.ts` pelo mesmo motivo (mover o helper para um service exigiria editar a rota de despesas, fora do escopo da T-036) — se um dia surgir um terceiro consumidor, extrair para `packages/rest-api/src/api/services/months.ts`.
- **Sem categoria e sem recorrência** em renda variável (fora de escopo): não há `normalizeCategory` nem materialização lazy aqui, então `GET /api/income-entries` é leitura pura (nenhuma escrita antes do SELECT, diferente do endpoint de despesas).
- Mesma consequência esperada da simetria: navegar para um mês passado/futuro não altera a parcela de fixas do total — não há histórico de quando uma fonte fixa passou a existir. Também **não há** histórico multi-mês em `/renda` (o "Últimos meses" da T-033 é só de despesas).

### Sobra do mês na Home é real, não só estimada (T-025, atualizada na T-036)
O hero da Home (`packages/web/src/routes/HomePage.tsx`) busca também `GET /api/expense-entries?month=` e `GET /api/income-entries?month=` (mês corrente via `currentMonthKey()` de `expenseMonth.ts`, fuso local) e calcula a sobra do mês com `computeMonthCashFlow` (`packages/web/src/routes/homeMetrics.ts`):

- `realBalance = (renda fixa + rendas variáveis do mês) − despesas fixas − despesas variáveis do mês`
- `estimatedBalance` (sobra **prevista**) continua sendo `renda fixa − despesas fixas`: o que é avulso, dos dois lados, não é previsível.
- `incomeTotal` = renda fixa + rendas variáveis do mês — é o que o card "Renda" (hero e card de layer) exibe; `expensesTotal` = fixas + variáveis, como já era.

O card "Sobra do mês" mostra o valor real com um sublabel comparando à prevista. As duas buscas mensais seguem o padrão `Promise.allSettled` das demais chamadas da Home (T-008) e falham **de forma independente**: `variableEntries`/`variableIncomeEntries` ficam `null` e cada lado é somado como 0 (nunca `NaN`), com uma flag de load própria — `entriesLoaded` (despesas, nome herdado da T-025/T-030) e `incomeEntriesLoaded` (rendas). O aviso discreto no sublabel aparece quando qualquer uma das duas flags é false, e só depois do primeiro carregamento (`!loading`), senão piscaria sempre. Sem gráficos ou histórico multi-mês na Home (decisão do humano — ver `TODO-HUMANO.md`).

### Dedupe de importação por `external_id` (T-084)
`income_entries.external_id` espelha exatamente a decisão de `expense_entries` — mesma coluna nullable, mesmo índice único parcial `(user_id, external_id) WHERE external_id IS NOT NULL`, mesmo `409` `{ error, duplicate: true, entry }` para `externalId` repetido do mesmo usuário, mesma validação (`validateExternalId`) e mesma função de escrita (`insertEntryWithExternalId`, em `server/src/api/services/externalId.ts`). As justificativas estão na seção "Dedupe de importação por `external_id` (T-084)" de `expenses-budgets.md`; a única diferença é que renda variável não tem recorrência, então a regra "`externalId` + `recurring: true` → 400" não existe aqui.

A importação de extrato OFX (T-085, `POST /api/import/ofx`) grava aqui todo **crédito** do extrato — o sinal do `TRNAMT` é o que decide entre `income_entries` e `expense_entries`, e renda não recebe categoria (não existe coluna). Decisões do parser e formato do relatório: seção "Importação de extrato OFX (T-085)" em `expenses-budgets.md`.

