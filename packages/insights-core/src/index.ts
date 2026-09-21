export {
  fetchCDIAccumulated,
  fetchIbovespaReturn,
  getPortfolioReturnAndEarliestDate,
} from './benchmarks';
export {
  buildCdiIndexSeries,
  buildIbovespaSeries,
  brapiRangeForDays,
  clampSeriesToWindow,
  fetchCdiSeries,
  fetchIbovespaSeries,
} from './benchmarkHistory';
export type { BcbRateRow, BrapiHistoryPoint } from './benchmarkHistory';
