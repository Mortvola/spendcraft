function getTransactionAmountForCategory(transaction, categoryId) {
    let { amount } = transaction;

    if (transaction.categories !== undefined && transaction.categories !== null
        && categoryId !== undefined && categoryId !== null) {
        const index = transaction.categories.findIndex((c) => c.categoryId === categoryId);
        if (index !== -1) {
            amount = transaction.categories[index].amount;
        }
    }

    return amount;
}

export default getTransactionAmountForCategory;
