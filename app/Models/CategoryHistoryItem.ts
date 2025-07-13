interface CategoryHistoryItem {
  id: number,
  months: {
    expenses: number,
    funding: number,
  }[],
}

export default CategoryHistoryItem;
