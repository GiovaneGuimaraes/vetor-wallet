import { normalizePhone } from './normalizePhone';

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  // 10-11 dígitos = DDD + telefone (fixo 8, celular 9); +55 na frente soma 2
  // dígitos, então 12-13 também são aceitos.
  return /^(55)?\d{10,11}$/.test(digits);
}
