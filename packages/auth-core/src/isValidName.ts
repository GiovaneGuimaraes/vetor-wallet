/**
 * T-092: validação pura do nome — string 1–120 chars após trim, ou `null` para
 * limpar o campo (quem decide o `null` é o router). Não aceita string vazia.
 */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 120;
}
