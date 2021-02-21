function getTransactionAmountForCategory(transaction, categoryId) {
  let { amount } = transaction;

  if (transaction.categories !== undefined && transaction.categories !== null
    && categoryId !== undefined && categoryId !== null
    && transaction.categories.some((c) => c.categoryId === categoryId)) {
    amount = transaction.categories.reduce((accum, item) => (
      accum + (item.categoryId === categoryId ? item.amount : 0)
    ), 0);
  }

  return amount;
}

export default getTransactionAmountForCategory;
