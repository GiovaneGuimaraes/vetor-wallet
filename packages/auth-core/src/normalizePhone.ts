/**
 * Formato flexível: aceita com/sem +55, com/sem separadores (espaço,
 * parênteses, hífen). Normaliza para dígitos puros — o valor persistido é
 * sempre só números (com 55 na frente se o usuário digitou o código do país).
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}
