export { daysInMonth } from './daysInMonth';
export { occurrenceDate } from './occurrenceDate';
export type { RecurringExpenseRow } from './RecurringExpenseRow';
export type { TransactionalDb, Transaction } from './TransactionalDb';
export { createRecurringExpenseEntry } from './createRecurringExpenseEntry';
export type {
  CreateRecurringEntryParams,
  CreateRecurringEntryResult,
} from './createRecurringExpenseEntry';
export { materializeRecurringExpenses } from './materializeRecurringExpenses';
export type { MaterializeRecurringExpensesParams } from './materializeRecurringExpenses';
export { listFixedExpenses } from './listFixedExpenses';
export type { ListFixedExpensesParams } from './listFixedExpenses';
export { createFixedExpense } from './createFixedExpense';
export type { CreateFixedExpenseParams } from './createFixedExpense';
export { updateFixedExpense } from './updateFixedExpense';
export type { UpdateFixedExpenseParams } from './updateFixedExpense';
export { deleteFixedExpense } from './deleteFixedExpense';
export type { DeleteFixedExpenseParams } from './deleteFixedExpense';

/**
 * Re-export histórico: o corpo mora em `@vetor-wallet/db` (`sqlErrors.ts`,
 * movido na T-097). O dedupe de importação usa a mesma checagem; fica aqui para
 * não quebrar os importadores.
 */
export { isUniqueViolation } from '@vetor-wallet/db';
