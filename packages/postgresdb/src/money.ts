import { DataType } from 'sequelize-typescript';

/**
 * O tipo de toda coluna de dinheiro no Postgres.
 *
 * Hoje, no SQLite, 17 colunas guardam dinheiro em `REAL` — ponto flutuante. É
 * dívida conhecida: somas que fecham por sorte, e a razão de o `savings-core` e
 * o `subscription-core` somarem em **centavos inteiros** antes de comparar.
 *
 * `NUMERIC(14,2)` é o tipo honesto: decimal exato, sem arredondamento
 * escondido. 14 dígitos com 2 casas comporta até 999.999.999.999,99 — folga
 * absurda para uma carteira pessoal, e barato.
 *
 * **Consequência a conferir na carga dos dados** (passo 8): somas por tabela
 * antes e depois, com diferença esperada de **zero**. Se aparecer diferença,
 * ela já existia no SQLite — o Postgres só a torna visível.
 *
 * O `pg` devolve `NUMERIC` como **string**, para não perder precisão em
 * `Number`. Quem converte é a borda: ver `@vetor-wallet/query`.
 */
export const MONEY = DataType.DECIMAL(14, 2);

/**
 * Colunas que guardam dinheiro em CENTAVOS INTEIROS, e continuam inteiras.
 *
 * `plans.price_cents`, `pix_charges.amount_cents`: o `subscription-core` já
 * trata dinheiro assim, e inteiro é exato por construção. Não vira `NUMERIC`
 * — trocar a unidade junto com o banco seria duas mudanças no mesmo passo.
 */
export const CENTS = DataType.INTEGER;
