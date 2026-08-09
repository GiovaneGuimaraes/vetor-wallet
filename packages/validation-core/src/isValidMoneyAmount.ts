import { MAX_MONEY_AMOUNT } from './MAX_MONEY_AMOUNT';

/**
 * Rigor monetário (T-052): centavos são a menor unidade aceita em qualquer
 * campo de dinheiro do app (`amount`, `target_amount`, `current_amount`
 * etc). `isValidMoneyAmount` complementa — não substitui — as checagens de
 * `Number.isFinite`/sinal já existentes em cada rota: aqui só a granularidade
 * de casas decimais é validada.
 *
 * Decisão de aritmética: em vez de escalar por 100 e comparar arredondamentos
 * (`Math.round(v * 100) / 100 === v` tem armadilhas de ponto flutuante —
 * `1.005 * 100` vira `100.49999999999999` em IEEE 754, então um round-trip
 * por escala não detecta a 3ª casa de forma confiável para todo valor), a
 * checagem usa a representação em string mais curta que o motor JS produz
 * para o double (`value.toString()`). Essa string é a mesma que o JSON de
 * origem tinha para qualquer literal decimal razoável (é o que
 * `JSON.parse` + `toString()` fazem de round-trip), então contar dígitos
 * após o "." nela é exato e não sofre do ruído de ponto flutuante que
 * atrapalharia uma comparação numérica.
 *
 * Casos cobertos por teste: `0.1` e `1.23` válidos (1-2 casas); `0.125`,
 * `1.234` e `1.005` inválidos (3 casas — inclusive o clássico `1.005`, cuja
 * representação binária mais próxima é ligeiramente menor que 1.005, mas
 * cuja string canônica ainda mostra as 3 casas digitadas); `123456789.12`
 * válido (2 casas em valor grande, sem cair em notação científica).
 *
 * Notação científica (`1e-7`, `1e21`...) é tratada como inválida: só aparece
 * para valores muito pequenos ou muito grandes, fora do universo de valores
 * monetários razoáveis do app — não vale a pena decompor o expoente.
 *
 * Limite superior: ver `MAX_MONEY_AMOUNT.ts` (T-065).
 */
export function isValidMoneyAmount(value: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (Math.abs(value) > MAX_MONEY_AMOUNT) return false;
  const str = value.toString();
  if (str.includes('e') || str.includes('E')) return false;
  const dotIndex = str.indexOf('.');
  if (dotIndex === -1) return true;
  return str.length - dotIndex - 1 <= 2;
}
