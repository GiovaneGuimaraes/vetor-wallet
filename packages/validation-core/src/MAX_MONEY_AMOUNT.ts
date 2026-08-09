/**
 * Limite superior explícito (T-065): além das casas decimais, valores
 * absurdamente grandes (`> MAX_MONEY_AMOUNT`, 1e13 — 10 trilhões) também são
 * rejeitados. Nenhum valor monetário legítimo do app (patrimônio pessoal,
 * aporte, meta) chega perto disso; sem o limite, um valor digitado errado
 * (dígitos a mais) passava por `Number.isFinite` e pelas 2 casas decimais sem
 * barreira nenhuma.
 */
export const MAX_MONEY_AMOUNT = 1e13;
