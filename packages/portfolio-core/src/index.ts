// Formato-alvo (T-104, fatias 1/2 e 2/2): uma função por arquivo, client
// injetado nas que tocam banco — `query: Query` desde a T-114. Nenhum arquivo
// daqui importa `@vetor-wallet/db` — importar este barrel NÃO abre conexão.

// ── Posição e resumo (puros) ──
export { applyOperation } from './applyOperation';
export { buildPositionMap } from './buildPositionMap';
export { getPositionQuantity } from './getPositionQuantity';
export { wouldExceedPosition } from './wouldExceedPosition';
export { computeDayProfitLoss } from './computeDayProfitLoss';
export { buildPortfolioSummary } from './buildPortfolioSummary';
export type { PositionEntry, SnapshotPoint } from './types';

// ── Carteira única ──
export { findDefaultWallet } from './findDefaultWallet';
export type { FindDefaultWalletParams } from './findDefaultWallet';
export { countWallets } from './countWallets';
export type { CountWalletsParams } from './countWallets';
export { withUserLock } from './withUserLock';
export { DEFAULT_WALLET, getOrCreateDefaultWallet } from './getOrCreateDefaultWallet';
export type { GetOrCreateDefaultWalletParams } from './getOrCreateDefaultWallet';

// ── Série histórica (puros) ──
export { shiftDate } from './shiftDate';
export { buildDateWindow } from './buildDateWindow';
export { buildPortfolioHistory } from './buildPortfolioHistory';

// ── Snapshots: datas BRT, retry, persistência/leitura e a coleta ──
// `fetchQuotesStrict` fica fora do barrel: só `runSnapshotJob` usa.
export { getBRTDate } from './getBRTDate';
export { isBusinessDay } from './isBusinessDay';
export { withRetry } from './withRetry';
export { resolveActiveTickers } from './resolveActiveTickers';
export type { ResolveActiveTickersParams } from './resolveActiveTickers';
export { saveSnapshot } from './saveSnapshot';
export type { SaveSnapshotParams } from './saveSnapshot';
export { saveSnapshotForDate } from './saveSnapshotForDate';
export type { SaveSnapshotForDateParams } from './saveSnapshotForDate';
export { getPreviousCloseSnapshots } from './getPreviousCloseSnapshots';
export type { GetPreviousCloseSnapshotsParams } from './getPreviousCloseSnapshots';
export { getSnapshotHistory } from './getSnapshotHistory';
export type { GetSnapshotHistoryParams } from './getSnapshotHistory';
export { listSnapshotPointsForWindow } from './listSnapshotPointsForWindow';
export type { ListSnapshotPointsForWindowParams } from './listSnapshotPointsForWindow';
export { runSnapshotJob } from './runSnapshotJob';
export type { RunSnapshotJobParams } from './runSnapshotJob';
export { catchUpIfNeeded } from './catchUpIfNeeded';
export type { CatchUpIfNeededParams } from './catchUpIfNeeded';
