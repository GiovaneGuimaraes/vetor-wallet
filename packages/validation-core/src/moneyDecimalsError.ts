/** Mensagem de erro padrão (acentuada, no estilo do repo) para o campo informado. */
export function moneyDecimalsError(field: string = 'amount'): string {
  return `${field} deve ter no máximo 2 casas decimais`;
}
