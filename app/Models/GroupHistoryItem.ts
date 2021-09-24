type MonthBalance = {
  year: number,
  month: number,
  amount: number,
}

export type CategoryHistoryItem = {
  id: number,
  months: MonthBalance[],
};

export type GroupHistoryItem = {
  id: number,
  name: string,
  categories: CategoryHistoryItem[],
};

