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

export interface CsvRowError {
  line: number;
  raw: string;
  error: string;
}

export interface CsvImportResult {
  imported: number;
  errors: CsvRowError[];
}
