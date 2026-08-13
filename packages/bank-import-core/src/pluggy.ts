import {
  isValidIsoDate,
  isValidMoneyAmount,
  normalizeCategory,
} from '@vetor-wallet/validation-core';
import { MAX_EXTERNAL_ID_LENGTH, insertEntryWithExternalId } from './externalId';
import { classifyInternalMovement } from './internalMovement';

/**
 * Mapeamento e gravação das transações do Open Finance via Pluggy (T-087).
 *
 * Este arquivo é a metade "nossa" da integração: o **client HTTP** vive em
 * `@vetor-wallet/pluggy-core` (categoria Integração, não toca o banco) e este
 * core é quem decide o que virá lançamento, com que chave de dedupe e em que
 * tabela. A idempotência **não é nova**: é a mesma da T-084 — `external_id`
 * `pluggy:<id da transação>` gravado por `insertEntryWithExternalId`, INSERT
 * primeiro e violação de unicidade traduzida em duplicata.
 *
 * O tipo de entrada é **estrutural** (`RawPluggyTransaction`) de propósito: este
 * package não importa `pluggy-core` — o `PluggyTransaction` do client encaixa
 * aqui por forma, e o teste pode montar uma transação sem subir a integração.
 */

/** Convenção de namespace da T-084 (`ofx:<FITID>` é a irmã dela). */
export const PLUGGY_EXTERNAL_ID_PREFIX = 'pluggy:';

export function pluggyExternalId(transactionId: string): string {
  return `${PLUGGY_EXTERNAL_ID_PREFIX}${transactionId}`;
}

/** Transação como o client da Pluggy a entrega: campos crus, nada validado. */
export interface RawPluggyTransaction {
  id: string | null;
  /** Timestamp ISO 8601 (`2026-08-11T00:00:00.000Z`), não `YYYY-MM-DD`. */
  date: string | null;
  description: string | null;
  descriptionRaw?: string | null;
  /** Com sinal, como veio da Pluggy. */
  amount: number | null;
  /** `CREDIT` | `DEBIT`. */
  type: string | null;
  category?: string | null;
  currencyCode: string | null;
  /** `POSTED` | `PENDING`. */
  status: string | null;
}

/**
 * Tipo da conta de onde a transação veio — muda a convenção de SINAL do valor
 * (ver `mapPluggyTransaction`). `BANK` é o default porque é o caso da conta
 * corrente/poupança; `CREDIT` é cartão.
 */
export type PluggyAccountKind = 'BANK' | 'CREDIT';

export const DEFAULT_PLUGGY_CATEGORY = 'outros';
export const DEFAULT_PLUGGY_DESCRIPTION = 'Lançamento importado (Pluggy)';
/** Mesmo teto do OFX: as tabelas não limitam, mas descrição de banco é verborrágica. */
export const MAX_PLUGGY_DESCRIPTION_LENGTH = 200;
/** O app é BRL-only (`Intl.NumberFormat` pt-BR/BRL em todo o web). */
export const SUPPORTED_PLUGGY_CURRENCY = 'BRL';

export interface MappedPluggyTransaction {
  transactionId: string;
  externalId: string;
  date: string;
  /** Valor ABSOLUTO — o sinal já foi consumido por `entryType` (T-084). */
  amount: number;
  description: string;
  /** Categoria normalizada (T-028); só usada em despesa. */
  category: string;
  entryType: 'income' | 'expense';
}

/**
 * Três maneiras de uma transação não virar lançamento, e elas **não** são
 * intercambiáveis:
 *
 * - **`skipped`** — legítima, mas ainda não pode ser importada (pendente); vai
 *   entrar numa passagem futura sozinha.
 * - **`rejected`** — este app não sabe importar (sem id, moeda estrangeira,
 *   sinal incoerente) e não vai melhorar sozinha. É o único desfecho que pede
 *   atenção de quem lê o relatório.
 * - **`internal`** — movimentação interna (T-088): decidimos não importar e
 *   está tudo certo. Separada de `rejected` de propósito — são as linhas mais
 *   comuns de um extrato real, e contá-las como rejeição faria todo relatório
 *   parecer cheio de erro.
 */
export type PluggyMapResult =
  | { ok: true; transaction: MappedPluggyTransaction }
  | { ok: false; outcome: 'skipped' | 'rejected' | 'internal'; reason: string };

/**
 * `date` da Pluggy → `YYYY-MM-DD`.
 *
 * **Sem conversão de timezone**, pelos 10 primeiros caracteres do timestamp:
 * é a mesma invariante do `DTPOSTED` do OFX (T-085). Converter para BRT moveria
 * um lançamento datado `2026-07-31T00:00:00.000Z` para 30/07 e jogaria o gasto
 * no mês anterior, divergindo do app do banco. Depois do corte, a data ainda
 * passa por `isValidIsoDate` (calendário real).
 */
export function parsePluggyDate(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.trim().slice(0, 10);
  return isValidIsoDate(iso) ? iso : null;
}

/**
 * Valida e converte uma transação da Pluggy no lançamento a inserir.
 *
 * Decisões travadas (cada rejeição/pulo vira uma linha do relatório, nunca um
 * erro do job inteiro — mesmo espírito da "rejeição por linha" do OFX):
 *
 * - **Sem `id` a transação é rejeitada**, nunca importada com id inventado: sem
 *   chave não há dedupe e ela voltaria duplicada na próxima sincronização.
 *   Mesmo motivo para rejeitar id que estoure 255 chars **com** o prefixo.
 * - **Só `POSTED` é importada; `PENDING` é PULADA.** Isto é uma armadilha real
 *   de idempotência, não preciosismo: uma transação pendente muda de valor e de
 *   descrição ao ser efetivada, mas mantém o `id` — se a importássemos, a
 *   segunda passagem cairia como **duplicata** e o valor provisório ficaria
 *   congelado no app para sempre. Pular agora e importar quando virar `POSTED`
 *   é o único desfecho que converge.
 * - **`currencyCode` diferente de `BRL` (ou ausente) é rejeitado.** O app é
 *   BRL-only; somar dólar como se fosse real corrompe o mês em silêncio, o pior
 *   tipo de erro em dinheiro. Ausente também rejeita: assumir BRL seria
 *   adivinhar a moeda de um campo de dinheiro.
 * - **`type` e o sinal de `amount` são fontes REDUNDANTES da direção. Se
 *   discordarem, a linha é rejeitada** — não escolhemos uma (mesma doutrina do
 *   `TRNAMT` com separador de milhar ambíguo na T-085: campo de dinheiro não se
 *   adivinha). A convenção de sinal depende do tipo de conta, e é da doc da
 *   Pluggy: em conta (`BANK`) o sinal é natural (`CREDIT` entra positivo,
 *   `DEBIT` sai negativo); em cartão (`CREDIT`) ela é **invertida** — compra
 *   nova (`DEBIT`) vem positiva porque aumenta a fatura, e pagamento/estorno
 *   (`CREDIT`) vem negativo.
 * - **`type` é quem decide income × expense** (`CREDIT` → `income_entries`,
 *   `DEBIT` → `expense_entries`) e o valor gravado é o **absoluto** (T-084).
 *   Aqui, ao contrário do OFX, o `type` é confiável: é enum de duas opções
 *   normalizado pelo agregador, não o vocabulário livre do `TRNTYPE`.
 * - **Movimentação interna não vira lançamento** (T-088): `Same person
 *   transfer`, `Credit card payment` e `Investments` saem como `internal`, com
 *   motivo. A checagem vem **antes** da validação de status/moeda/sinal de
 *   propósito: uma vez decidido que a linha não é dinheiro do mês, validar o
 *   resto é moot, e reportá-la como `rejected` por um sinal incoerente pediria
 *   atenção do humano para uma linha que está correta. Consequência: o desfecho
 *   é o **mesmo** com a transação pendente ou efetivada — não muda de `skipped`
 *   para `internal` entre duas passagens. Lista e rationale em
 *   `internalMovement.ts`.
 * - **Categoria**: `category` da Pluggy quando vier, senão a descrição
 *   normalizada, senão `outros` — as três passando por `normalizeCategory`
 *   (T-028). A `category` da Pluggy vem do enriquecimento (plano Pro) e é
 *   determinística por estabelecimento, então é informação estritamente melhor
 *   que a descrição; quando ela não existe (é o caso do Meu Pluggy gratuito),
 *   degradamos exatamente para a regra do OFX — descrição normalizada, que já
 *   faz o mesmo estabelecimento cair numa categoria só.
 */
export function mapPluggyTransaction(
  raw: RawPluggyTransaction,
  accountKind: PluggyAccountKind = 'BANK'
): PluggyMapResult {
  const reject = (reason: string): PluggyMapResult => ({ ok: false, outcome: 'rejected', reason });

  const transactionId = raw.id?.trim();
  if (!transactionId) return reject('Transação sem id (sem id não há dedupe)');

  const externalId = pluggyExternalId(transactionId);
  if (externalId.length > MAX_EXTERNAL_ID_LENGTH) {
    return reject('id da transação excede o tamanho máximo suportado');
  }

  // T-088 — antes de qualquer outra validação: se não é dinheiro do mês, o
  // resto dos campos não importa (ver o bloco de decisões acima).
  const internalReason = classifyInternalMovement(raw.category);
  if (internalReason) {
    return { ok: false, outcome: 'internal', reason: internalReason };
  }

  const status = raw.status?.trim().toUpperCase() ?? null;
  if (status === 'PENDING') {
    return {
      ok: false,
      outcome: 'skipped',
      reason: 'Transação pendente (PENDING) — será importada quando efetivar',
    };
  }
  if (status !== 'POSTED') {
    return reject(`Status não suportado: ${status ?? 'ausente'}`);
  }

  const currency = raw.currencyCode?.trim().toUpperCase() ?? null;
  if (currency !== SUPPORTED_PLUGGY_CURRENCY) {
    return reject(
      `Moeda não suportada: ${currency ?? 'ausente'} (o app é ${SUPPORTED_PLUGGY_CURRENCY})`
    );
  }

  const date = parsePluggyDate(raw.date);
  if (!date) return reject('Data inválida ou ausente');

  const type = raw.type?.trim().toUpperCase() ?? null;
  if (type !== 'CREDIT' && type !== 'DEBIT') {
    return reject(`Tipo não suportado: ${type ?? 'ausente'}`);
  }

  const signed = raw.amount;
  if (signed === null || signed === undefined || !Number.isFinite(signed)) {
    return reject('Valor inválido ou ausente');
  }
  if (signed === 0) return reject('Valor igual a zero');

  // Sinal esperado para este `type` NESTA conta. Cartão inverte (ver doc).
  const expectsPositive = accountKind === 'CREDIT' ? type === 'DEBIT' : type === 'CREDIT';
  if (expectsPositive !== signed > 0) {
    return reject(`Sinal do valor (${signed}) incoerente com type=${type} em conta ${accountKind}`);
  }

  const amount = Math.abs(signed);
  if (!isValidMoneyAmount(amount)) {
    return reject('Valor fora do formato monetário aceito (máx. 2 casas decimais)');
  }

  const rawDescription = raw.description?.trim() || raw.descriptionRaw?.trim() || null;
  const description = (rawDescription ?? DEFAULT_PLUGGY_DESCRIPTION).slice(
    0,
    MAX_PLUGGY_DESCRIPTION_LENGTH
  );
  const categorySource = raw.category?.trim() || rawDescription;
  const category = categorySource
    ? normalizeCategory(categorySource).slice(0, MAX_PLUGGY_DESCRIPTION_LENGTH) ||
      DEFAULT_PLUGGY_CATEGORY
    : DEFAULT_PLUGGY_CATEGORY;

  return {
    ok: true,
    transaction: {
      transactionId,
      externalId,
      date,
      amount,
      description,
      category,
      entryType: type === 'CREDIT' ? 'income' : 'expense',
    },
  };
}

/**
 * Status de uma linha do relatório da sincronização.
 *
 * `imported`/`duplicated`/`rejected` são o mesmo vocabulário da importação de
 * OFX (T-085). `skipped` é a transação pendente (ver `mapPluggyTransaction`), e
 * `previewed` só existe no `--dry-run` — é o que a linha SERIA se o job
 * gravasse. Chamar de `imported` no dry-run seria mentir no relatório, e chamar
 * de `pending` colidiria com o `PENDING` da Pluggy. `internal` é a movimentação
 * interna da T-088 — o mesmo status nas duas modalidades, porque a linha não é
 * gravada nem com `dryRun: false`.
 */
export type PluggyImportStatus =
  'imported' | 'duplicated' | 'rejected' | 'skipped' | 'internal' | 'previewed';

export interface PluggyImportLine {
  status: PluggyImportStatus;
  transactionId?: string;
  date?: string;
  /** Sempre absoluto; a direção está em `entryType`. */
  amount?: number;
  description?: string;
  entryType?: 'income' | 'expense';
  /** Motivo em pt-BR nas linhas `rejected`/`skipped`. */
  reason?: string;
  /** Id da linha gravada — ou da que já existia, na duplicata. */
  entryId?: number;
}

export interface PluggyImportResult {
  imported: number;
  duplicated: number;
  rejected: number;
  skipped: number;
  /** Movimentação interna não importada (T-088). */
  internal: number;
  previewed: number;
  transactions: PluggyImportLine[];
}

export interface ImportPluggyTransactionsParams {
  userId: number;
  transactions: RawPluggyTransaction[];
  /** Tipo da conta de origem — decide a convenção de sinal. Default `BANK`. */
  accountKind?: PluggyAccountKind;
  /** `true` = não escreve NADA no banco; as linhas mapeadas viram `previewed`. */
  dryRun?: boolean;
}

/**
 * Importa um lote de transações da Pluggy para `income_entries`/`expense_entries`.
 *
 * - **Os INSERTs são sequenciais, não em `db.batch`** — cada um precisa VER o
 *   anterior para que o mesmo id repetido dentro do próprio lote caia como
 *   duplicata em vez de estourar o índice único e derrubar o lote (mesma decisão
 *   da T-085).
 * - **`dryRun` corta antes de qualquer chamada ao banco.** É a garantia que o
 *   `--dry-run` do job promete, e ela vive aqui (num lugar só, testável) em vez
 *   de num `if` do CLI.
 * - Duplicata **não é erro**: é linha do relatório (T-084, convenção de lote).
 * - **Movimentação interna nunca chega ao banco** (T-088), com ou sem
 *   `dryRun` — ela é cortada no mapeamento, então o `external_id` daquela
 *   transação segue **livre**. Isso é o que permite que, quando o layer de
 *   investimentos existir, uma nova sincronização da mesma janela importe as
 *   linhas `Investments` sem esbarrar no dedupe.
 */
export async function importPluggyTransactions(
  params: ImportPluggyTransactionsParams
): Promise<PluggyImportResult> {
  const { userId, transactions, accountKind = 'BANK', dryRun = false } = params;

  const lines: PluggyImportLine[] = [];
  let imported = 0;
  let duplicated = 0;
  let rejected = 0;
  let skipped = 0;
  let internal = 0;
  let previewed = 0;

  for (const raw of transactions) {
    const mapped = mapPluggyTransaction(raw, accountKind);

    if (!mapped.ok) {
      if (mapped.outcome === 'skipped') skipped++;
      else if (mapped.outcome === 'internal') internal++;
      else rejected++;
      // Campos crus quando legíveis: identificam a linha no relatório mesmo
      // quando foi outro campo que derrubou a transação (padrão do OFX).
      const rawDate = parsePluggyDate(raw.date);
      lines.push({
        status: mapped.outcome,
        reason: mapped.reason,
        ...(raw.id ? { transactionId: raw.id } : {}),
        ...(rawDate ? { date: rawDate } : {}),
        ...(typeof raw.amount === 'number' && Number.isFinite(raw.amount)
          ? { amount: Math.abs(raw.amount) }
          : {}),
        ...(raw.description ? { description: raw.description } : {}),
      });
      continue;
    }

    const tx = mapped.transaction;
    const base: PluggyImportLine = {
      status: 'previewed',
      transactionId: tx.transactionId,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      entryType: tx.entryType,
    };

    if (dryRun) {
      previewed++;
      lines.push(base);
      continue;
    }

    const isIncome = tx.entryType === 'income';
    const result = await insertEntryWithExternalId({
      table: isIncome ? 'income_entries' : 'expense_entries',
      userId,
      values: isIncome
        ? { description: tx.description, amount: tx.amount, date: tx.date }
        : {
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            category: tx.category,
          },
      externalId: tx.externalId,
    });

    const entryId = result.row ? Number(result.row.id) : undefined;
    if (result.status === 'duplicate') duplicated++;
    else imported++;
    lines.push({
      ...base,
      status: result.status === 'duplicate' ? 'duplicated' : 'imported',
      ...(entryId !== undefined ? { entryId } : {}),
    });
  }

  return { imported, duplicated, rejected, skipped, internal, previewed, transactions: lines };
}
