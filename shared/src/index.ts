export type OperationType = 'BUY' | 'SELL';

export interface Operation {
  id: number;
  ticker: string;
  type: OperationType;
  quantity: number;
  price: number;
  date: string;
  created_at: string;
}

export interface NewOperation {
  ticker: string;
  type: OperationType;
  quantity: number;
  price: number;
  date: string;
}

export interface Position {
  ticker: string;
  quantity: number;
  avgPrice: number;
  invested: number;
  currentPrice: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPct: number | null;
  allocationPct: number | null;
}

export interface PortfolioSummary {
  positions: Position[];
  totalInvested: number;
  totalCurrentValue: number | null;
  totalProfitLoss: number | null;
  totalProfitLossPct: number | null;
}

export type AlertRuleType = 'PRICE_ABOVE' | 'PRICE_BELOW' | 'CHANGE_PCT' | 'ALLOCATION_PCT';

export interface AlertRule {
  id: number;
  ticker: string;
  type: AlertRuleType;
  threshold: number;
  active: number;
  created_at: string;
}

export interface NewAlertRule {
  ticker: string;
  type: AlertRuleType;
  threshold: number;
}

export interface CsvRowError {
  line: number;
  raw: string;
  error: string;
}

export interface CsvImportResult {
  imported: number;
  errors: CsvRowError[];
}

export interface BenchmarkData {
  period: { from: string; to: string };
  portfolio: number | null;
  cdi: number | null;
  ibovespa: number | null;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}
