import { isValidIsoDate } from './dates';
import { isValidMoneyAmount } from './money';
import { normalizeCategory } from './categories';
import { MAX_EXTERNAL_ID_LENGTH } from './externalId';

/**
 * Parser de extrato OFX + mapeamento para lançamentos (T-085).
 *
 * ## Por que parser próprio (sem lib)
 *
 * OFX tem dois dialetos incompatíveis na superfície — 1.x é SGML (header
 * `OFXHEADER:100`, tags de folha **sem** fechamento) e 2.x é XML — mas o que o
 * app precisa de um extrato é sempre o mesmo punhado de campos dentro de cada
 * `<STMTTRN>`: `FITID`, `DTPOSTED`, `TRNAMT`, `MEMO`/`NAME`, `TRNTYPE`. Nos dois
 * dialetos os **agregados** (`STMTTRN`) são fechados; só as folhas divergem. Um
 * scanner de tag→valor que corta o valor no primeiro `<` ou fim de linha lê os
 * dois formatos com a mesma função, sem dependência nova e sem construir árvore.
 * Consequência aceita: não validamos o documento (nem SGML nem XML) — um arquivo
 * sintaticamente sujo mas com blocos `<STMTTRN>` legíveis é importado; o que não
 * tiver `<OFX>` é rejeitado com 400.
 *
 * ## Charset (`decodeOfx`)
 *
 * O corpo chega como `Buffer` (a rota usa `express.raw`, não `express.text`)
 * justamente porque bancos brasileiros ainda exportam OFX 1.x em cp1252 —
 * decodificar tudo como UTF-8 transformaria "Supermercado Açaí" em mojibake e
 * essa sujeira iria para a **categoria** normalizada, virando duas categorias
 * distintas para o mesmo estabelecimento. O header ASCII é lido primeiro
 * (`CHARSET:1252` / `ENCODING:USASCII`) e o corpo decodificado como `latin1`
 * nesse caso. cp1252 difere de latin-1 apenas na faixa 0x80–0x9F (aspas
 * tipográficas, travessão) — sem decoder cp1252 no Node, essas poucas posições
 * viram controles invisíveis no MEMO em vez de acento errado. Troca aceita.
 */

/** Uma transação como ela aparece no arquivo: campos crus, nada validado. */
export interface RawOfxTransaction {
  fitid: string | null;
  dtposted: string | null;
  trnamt: string | null;
  memo: string | null;
  name: string | null;
  trntype: string | null;
}

export type OfxParseResult =
  | { ok: true; transactions: RawOfxTransaction[] }
  | { ok: false; error: string };

const HEADER_PEEK_BYTES = 512;

/**
 * Decodifica o corpo do upload. `string` passa direto (chamador já decodificou);
 * `Buffer` é decodificado como latin1 quando o header declara CHARSET 1252,
 * UTF-8 no resto dos casos (default do OFX 2.x e de exportadores modernos).
 */
export function decodeOfx(input: Buffer | string): string {
  if (typeof input === 'string') return input;
  const head = input.subarray(0, HEADER_PEEK_BYTES).toString('latin1').toUpperCase();
  const isLatin1 =
    /CHARSET\s*[:=]\s*"?1252/.test(head) ||
    /CHARSET\s*[:=]\s*"?LATIN1/.test(head) ||
    /ENCODING\s*[:=]\s*"?USASCII/.test(head);
  return input.toString(isLatin1 ? 'latin1' : 'utf8');
}

const STMTTRN_RE = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
// Nome de tag SEM `/` na classe: fechamentos (`</FITID>`) nunca casam, então o
// mesmo regex serve para SGML (sem fechamento) e XML (com).
const FIELD_RE = /<([A-Za-z][A-Za-z0-9._]*)>([^<\r\n]*)/g;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Entidades XML/HTML usadas por exportadores de OFX (inclui numéricas). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function cleanValue(raw: string): string | null {
  const value = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
}

/**
 * Extrai as transações do arquivo. Só um erro é de documento (400): não parecer
 * OFX. Arquivo OFX válido **sem** transações devolve lista vazia (extrato de
 * período sem movimento é legítimo, não é erro do usuário).
 */
export function parseOfx(content: string): OfxParseResult {
  if (!content.trim()) return { ok: false, error: 'Arquivo vazio' };
  if (!/<OFX[\s>]/i.test(content)) {
    return { ok: false, error: 'Arquivo não parece ser um OFX (tag <OFX> ausente)' };
  }

  const transactions: RawOfxTransaction[] = [];
  STMTTRN_RE.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = STMTTRN_RE.exec(content)) !== null) {
    const fields = new Map<string, string>();
    FIELD_RE.lastIndex = 0;
    let field: RegExpExecArray | null;
    while ((field = FIELD_RE.exec(block[1])) !== null) {
      const tag = field[1].toUpperCase();
      // Primeira ocorrência vence: dentro de um STMTTRN pode haver agregados
      // (`<CCACCTTO>`) repetindo nomes de campo — o do topo é o da transação.
      if (!fields.has(tag)) fields.set(tag, field[2]);
    }
    transactions.push({
      fitid: cleanValue(fields.get('FITID') ?? ''),
      dtposted: cleanValue(fields.get('DTPOSTED') ?? ''),
      trnamt: cleanValue(fields.get('TRNAMT') ?? ''),
      memo: cleanValue(fields.get('MEMO') ?? ''),
      name: cleanValue(fields.get('NAME') ?? ''),
      trntype: cleanValue(fields.get('TRNTYPE') ?? ''),
    });
  }

  return { ok: true, transactions };
}

/**
 * `DTPOSTED` → `YYYY-MM-DD`. O formato é `YYYYMMDD` com hora e fuso opcionais
 * (`20260731120000[-3:BRT]`).
 *
 * Decisão: a **data local do extrato** é a que vale — usamos os 8 primeiros
 * dígitos e **ignoramos** o offset de fuso, sem converter para UTC. Converter
 * moveria uma compra de 31/07 23:00 BRT para 01/08, jogando o gasto no mês
 * seguinte e divergindo do que o app do banco mostra. Devolve `null` se não
 * houver 8 dígitos ou se a data não existir no calendário (`isValidIsoDate`).
 */
export function parseOfxDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return isValidIsoDate(iso) ? iso : null;
}

/**
 * `TRNAMT` → número (com sinal). Aceita ponto ou vírgula decimal (exportadores
 * pt-BR emitem `-1234,56`) e sinal à esquerda. **Não** aceita separador de
 * milhar: `1.234,56` é ambíguo contra `1.234` (mil duzentos e trinta e quatro
 * vs. um e pouco) e adivinhar num campo de dinheiro é pior do que rejeitar a
 * linha com motivo no relatório.
 */
export function parseOfxAmount(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '');
  if (!/^[+-]?\d+([.,]\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Convenção de namespace da T-084: `ofx:<FITID>`. */
export function ofxExternalId(fitid: string): string {
  return `ofx:${fitid}`;
}

export const DEFAULT_OFX_CATEGORY = 'outros';
export const DEFAULT_OFX_DESCRIPTION = 'Lançamento importado (OFX)';
/** Teto de descrição: as tabelas não têm limite, mas MEMO de banco é verborrágico. */
export const MAX_OFX_DESCRIPTION_LENGTH = 200;

export interface MappedOfxTransaction {
  fitid: string;
  externalId: string;
  date: string;
  /** Valor ABSOLUTO — o sinal do TRNAMT já foi consumido por `entryType`. */
  amount: number;
  description: string;
  /** Categoria normalizada (T-028); só usada em despesa. */
  category: string;
  entryType: 'income' | 'expense';
}

export type OfxMapResult =
  | { ok: true; transaction: MappedOfxTransaction }
  | { ok: false; reason: string };

/**
 * Valida e converte uma transação crua no lançamento a inserir.
 *
 * Regras de rejeição (cada uma vira uma linha `rejected` no relatório, nunca um
 * erro da request inteira — o espírito da "rejeição por linha" do import CSV):
 * FITID ausente (**não** inventamos id: sem FITID não há dedupe, e importar sem
 * chave duplicaria a transação no próximo extrato), FITID longo demais para a
 * coluna com o prefixo, DTPOSTED ausente/irreal, TRNAMT ausente/ilegível,
 * TRNAMT zero (não é crédito nem débito) e valor fora do rigor monetário do app
 * (`isValidMoneyAmount`: máx. 2 casas, teto de 1e13).
 *
 * `entryType` vem do **sinal**: crédito (> 0) → `income_entries`, débito (< 0) →
 * `expense_entries`. `TRNTYPE` é ignorado de propósito — é redundante com o
 * sinal na prática e bancos divergem no vocabulário (`DEBIT`, `POS`, `XFER`,
 * `FEE`), então o sinal é a fonte mais confiável.
 */
export function mapOfxTransaction(raw: RawOfxTransaction): OfxMapResult {
  if (!raw.fitid) return { ok: false, reason: 'FITID ausente' };
  const externalId = ofxExternalId(raw.fitid);
  if (externalId.length > MAX_EXTERNAL_ID_LENGTH) {
    return { ok: false, reason: 'FITID excede o tamanho máximo suportado' };
  }

  const date = parseOfxDate(raw.dtposted);
  if (!date) return { ok: false, reason: 'DTPOSTED inválida ou ausente' };

  const signed = parseOfxAmount(raw.trnamt);
  if (signed === null) return { ok: false, reason: 'TRNAMT inválido ou ausente' };
  if (signed === 0) return { ok: false, reason: 'TRNAMT igual a zero' };

  const amount = Math.abs(signed);
  if (!isValidMoneyAmount(amount)) {
    return { ok: false, reason: 'TRNAMT fora do formato monetário aceito (máx. 2 casas decimais)' };
  }

  const memo = raw.memo ?? raw.name;
  const description = (memo ?? DEFAULT_OFX_DESCRIPTION).slice(0, MAX_OFX_DESCRIPTION_LENGTH);
  // Categoria derivada do MEMO via a MESMA normalização das telas de despesa
  // (T-028), para que o mesmo estabelecimento caia numa categoria só. Sem
  // classificação inteligente (fora de escopo): a categoria é o próprio memo
  // normalizado, e cai em 'outros' quando não há memo/name.
  const category = memo ? normalizeCategory(memo).slice(0, MAX_OFX_DESCRIPTION_LENGTH) : DEFAULT_OFX_CATEGORY;

  return {
    ok: true,
    transaction: {
      fitid: raw.fitid,
      externalId,
      date,
      amount,
      description,
      category: category || DEFAULT_OFX_CATEGORY,
      entryType: signed > 0 ? 'income' : 'expense',
    },
  };
}
