// T-043: `DATE_RE` (formato `YYYY-MM-DD`) sozinho aceita datas que não existem
// no calendário — `2026-02-30`, `2026-13-01` — porque só checa dígitos, não
// existência. `isValidIsoDate` combina o regex de formato com uma checagem de
// calendário real (meses curtos, ano bissexto), sem depender de biblioteca
// externa de datas.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Valida que `value` é uma string no formato `YYYY-MM-DD` que corresponde a
 * uma data real do calendário (mês 01-12, dia válido para aquele mês/ano,
 * incluindo 29/02 em anos bissextos e rejeitando em anos não bissextos).
 *
 * Não valida se a data é passada/futura — o app aceita datas futuras em
 * todas as rotas (decisão de produto, fora de escopo desta função).
 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }

  // `Date.UTC` normaliza dias fora da faixa do mês (ex.: 30/02 vira 02/03),
  // então checar month/day de volta contra o que foi pedido detecta datas
  // que não existem — incluindo o caso do 29/02 em ano não bissexto.
  //
  // Efeito colateral conhecido e aceito (T-055): `Date.UTC` mapeia anos de
  // 0 a 99 para 1900-1999 (comportamento legado do próprio JS, não desta
  // função) — então uma data como "0026-07-25" tem seu ano lido de volta
  // como 2026 (via getUTCFullYear) e diverge do `year` pedido (26),
  // resultando em `false`. Ou seja: anos com 1-2 dígitos no formato de 4
  // dígitos (ex.: "0026") são rejeitados por este round-trip, não por uma
  // checagem explícita de faixa — comportamento desejado, já que o app não
  // usa datas de calendário anteriores ao ano 100.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
