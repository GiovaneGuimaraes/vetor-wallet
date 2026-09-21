/** O template de recorrência, como ele sai de `recurring_expenses`. */
export interface RecurringExpenseRow {
  id: number;
  description: string;
  category: string;
  amount: number;
  day_of_month: number;
  start_month: string;
}
