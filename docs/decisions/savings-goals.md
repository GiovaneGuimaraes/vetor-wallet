# Decisões: poupança e metas

> **Movido.** As decisões vivas deste domínio vivem agora em
> [`packages/savings-core/CLAUDE.md`](../../packages/savings-core/CLAUDE.md)
> (T-099b, Ciclo 19 — arquitetura em módulos): saldo da poupança em centavos
> inteiros, previsão de rendimento client-side (T-040/T-062), aviso de saque
> acima do saldo (T-079) e CTA de onboarding na Home (T-080).

## Metas foi REMOVIDA do app (T-091b1, 2026-08-14)

Decisão do humano, em resposta à pendência de 2026-08-13 do `TODO-HUMANO.md`:
**opção (b) — Metas some sem substituto.** O app deixou de ter o conceito de
objetivo. A caixinha de Renda Fixa (T-091c/d) **não** herda esse papel e
**nenhuma meta virou caixinha**: não houve migração de dado, campo de objetivo
novo, nem tela substituta.

O que saiu na T-091b1 (etapa 1 de 2 — só código):

- Rotas `/api/goals/*` e `POST /api/savings/transfer-to-goal` (o par atômico da
  T-041 perdeu o destino e saiu com ela).
- `goalId` nos corpos de `POST`/`PATCH` de `/api/savings`: deixou de ser aceito e
  passou a ser **ignorado em silêncio**, o tratamento que a API já dá a qualquer
  campo desconhecido. Um `PATCH` só com `goalId` cai no `400` de corpo vazio.
- `packages/savings-core/src/goals.ts`, o progresso de meta manual × derivado
  (T-024) e toda a aritmética de reserva (`sumReservedByGoal`,
  `computeReservedTotal`, `computeFreeBalance`, `pickTransferLegs`).
- No web: `/metas`, o card da Home, o vínculo de lançamento com meta, o card
  "Transferir para uma meta", o card "Saldo livre" e o deep-link `?meta=<id>`.

O que **explicitamente não** saiu, e por quê:

- **Nenhuma linha de banco foi apagada.** A tabela `goals`, a coluna
  `savings_entries.goal_id` e o índice `idx_savings_entries_goal` continuam em
  `packages/db/src/schema.ts`, intactos. O `DROP` é a **etapa 2 (T-091b2)**, que
  só roda depois de o humano abrir o app sem Metas e confirmar. Dado órfão no
  banco até lá é o resultado esperado, não um defeito.
- `savings_entries.transfer_group` sobrevive como **procedência de dado legado**:
  pares gravados antes da remoção continuam no banco e a lista de `/poupanca`
  ainda os marca com o selo `⇄`. Nada novo nasce com o campo.

**Invariante que a remoção reescreveu (não apagou)**: o **saldo livre** da
poupança passou a ser o **saldo inteiro** — não há mais reserva a descontar. A
aritmética continua em **centavos inteiros** (T-041/T-052): lançamento legado com
`goal_id` preenchido conta **integralmente** no saldo, e é esse o caso coberto
pelo teste novo em `savings.test.ts` e em `routes/savings.test.ts`.
