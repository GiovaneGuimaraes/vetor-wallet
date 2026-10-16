// ── Formato-alvo (T-104, fatia portfolio-core 1/2): uma função por arquivo ──
export { applyOperation } from './applyOperation';
export { buildPositionMap } from './buildPositionMap';
export { getPositionQuantity } from './getPositionQuantity';
export { wouldExceedPosition } from './wouldExceedPosition';
export { computeDayProfitLoss } from './computeDayProfitLoss';
export { buildPortfolioSummary } from './buildPortfolioSummary';
export type { PositionEntry } from './types';
export { findDefaultWallet } from './findDefaultWallet';
export type { FindDefaultWalletParams } from './findDefaultWallet';
export { countWallets } from './countWallets';
export type { CountWalletsParams } from './countWallets';
export { withUserLock } from './withUserLock';
export { DEFAULT_WALLET, getOrCreateDefaultWallet } from './getOrCreateDefaultWallet';
export type { GetOrCreateDefaultWalletParams } from './getOrCreateDefaultWallet';

// ── Formato ANTIGO (fatia 2/2 pendente): arquivo-balaio, `db` singleton, Vitest ──
// `snapshots.ts` ainda importa o singleton de `@vetor-wallet/db`, então importar
// este barrel continua instanciando o client libsql — some na fatia 2.
export { shiftDate, buildDateWindow, buildPortfolioHistory } from './portfolioHistory';
export type { SnapshotPoint } from './portfolioHistory';
export {
  getBRTDate,
  isBusinessDay,
  withRetry,
  resolveActiveTickers,
  saveSnapshot,
  saveSnapshotForDate,
  getPreviousCloseSnapshots,
  getSnapshotHistory,
  runSnapshotJob,
  catchUpIfNeeded,
} from './snapshots';
