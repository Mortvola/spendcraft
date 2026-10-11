import { runInAction } from 'mobx';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import Transaction from './Transaction';
import {
  ApiResponse,
  CategoryTransferProps,
  isInsertCategoryTransferResponse, TransactionType, TransactionProps, TransactionsResponse,
} from '../../common/ResponseTypes';
import {
  RegisterInterface, StoreInterface, TransactionInterface, TransactionContainerInterface, CategoryInterface,
} from './Types';

class Register implements RegisterInterface {
  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async addCategoryTransfer(
    values: {
      categories: CategoryTransferProps[];
      date: string;
    },
    type: TransactionType,
  ): Promise<null> {
    const response = await Http.post<unknown, ApiResponse<unknown>>('/api/v1/category-transfer', { ...values, type });

    if (!response.ok) throw new Error('invalid response');
    const { data } = await response.body();

    if (isInsertCategoryTransferResponse(data)) {
      runInAction(() => {
        // If the new transaction categories include
        // the current category then insert the transaction.
        if (
          this.store.uiState.selectedCategory !== null
          && values.categories.some((c) => (
            this.store.uiState.selectedCategory && c.categoryId === this.store.uiState.selectedCategory.id
          ))
        ) {
          // Determine where to insert the transaction based on date.
          let index = this.store.uiState.selectedCategory.transactions.transactions.findIndex(
            (t) => t.date <= DateTime.fromISO(values.date),
          );

          // If the index was not found then insert at the end of the list of transactions.
          if (index === -1) {
            index = this.store.uiState.selectedCategory.transactions.transactions.length;
          }

          this.store.uiState.selectedCategory.transactions.transactions = [
            ...this.store.uiState.selectedCategory.transactions.transactions.slice(0, index),
            new Transaction(this.store, data.transaction),
            ...this.store.uiState.selectedCategory.transactions.transactions.slice(index),
          ];
        }

        this.store.categoryTree.updateBalances(data.balances);

        // if (this.store.uiState.selectedCategory !== null) {
        //   const category = body.balances.find((c) => c.id === this.store.uiState.selectedCategory.id);

        //   if (category) {
        //     // this.balance = category.balance;
        //   }
        // }
      });

      return null;
    }

    throw new Error('invalid response');
  }

  private containers(): { container: TransactionContainerInterface, categoryId?: number }[] {
    const containers: { container: TransactionContainerInterface, categoryId?: number }[] = [
      { container: this.store.searcher.transactions },
    ];
    for (const institution of this.store.accounts.institutions) {
      for (const account of institution.accounts) {
        containers.push({ container: account.transactions }, { container: account.pendingTransactions });
      }
    }
    const addCategory = (category: CategoryInterface) => {
      containers.push({ container: category.transactions, categoryId: category.id },
        { container: category.pendingTransactions, categoryId: category.id });
      category.subcategories.forEach(addCategory);
    };
    this.store.categoryTree.budget.forEachCatgory(addCategory);
    this.store.categoryTree.bills.forEachCatgory(addCategory);
    if (this.store.categoryTree.unassignedCat) addCategory(this.store.categoryTree.unassignedCat);
    if (this.store.categoryTree.accountTransferCat) addCategory(this.store.categoryTree.accountTransferCat);
    if (this.store.categoryTree.rebalances) containers.push({ container: this.store.categoryTree.rebalances.transactions });
    return containers.filter((entry, index) => containers.findIndex(
      (candidate) => candidate.container === entry.container,
    ) === index);
  }

  forEachTransaction(callback: (transaction: TransactionInterface) => void): void {
    const transactions = new Set(this.containers().flatMap(({ container }) => container.transactions));
    if (this.store.uiState.selectedTransaction) transactions.add(this.store.uiState.selectedTransaction);
    transactions.forEach(callback);
  }

  updateTransaction(props: TransactionProps): void {
    if (props.id === null) throw new Error('transaction has a null id');
    const id = props.id;
    runInAction(() => {
      this.forEachTransaction((transaction) => {
        if (transaction.id === props.id) transaction.refresh(props);
      });
      for (const { container, categoryId } of this.containers()) {
        const transaction = container.transactions.find((entry) => entry.id === props.id);
        if (!transaction) continue;
        container.removeTransaction(id);
        const belongs = categoryId === undefined || props.categories.some((entry) => entry.categoryId === categoryId)
          || (props.categories.length === 0 && categoryId === this.store.categoryTree.unassignedCat?.id);
        if (belongs) container.insertTransaction(transaction);
      }
    });
  }

  async refreshReconciliation(accountId: number): Promise<void> {
    const ids = new Set<number>();
    this.forEachTransaction((transaction) => {
      if (transaction.accountId === accountId && transaction.id !== null) ids.add(transaction.id);
    });
    if (ids.size === 0) return;
    // Use the existing batch endpoint without replacing paginated/filtered registers.
    const query = new URLSearchParams([...ids].map((id) => ['t', String(id)]));
    const response = await Http.get<ApiResponse<TransactionsResponse>>(`/api/v1/transactions?${query}`);
    if (!response.ok) throw new Error('Unable to refresh transaction reconciliation');
    const { data } = await response.body();
    if (!Array.isArray(data?.transactions) || data.transactions.length !== ids.size) {
      throw new Error('Invalid transaction reconciliation response');
    }
    const memberships = data.transactions.map((props) => {
      const statementId = props.accountTransaction?.statementId;
      if (props.id === null || !ids.has(props.id) || props.accountTransaction?.account.id !== accountId
        || (statementId !== null && !Number.isFinite(statementId))) {
        throw new Error('Invalid transaction reconciliation response');
      }
      return { id: props.id, statementId };
    });
    if (new Set(memberships.map((entry) => entry.id)).size !== ids.size) {
      throw new Error('Incomplete transaction reconciliation response');
    }
    runInAction(() => {
      this.forEachTransaction((transaction) => {
        const membership = memberships.find((entry) => entry.id === transaction.id);
        if (membership) transaction.statementId = membership.statementId;
      });
    });
  }

  removeTransaction(transactionId: number): void {
    for (const { container } of this.containers()) container.removeTransaction(transactionId);
    if (this.store.uiState.selectedTransaction?.id === transactionId) this.store.uiState.selectTransaction(null);
  }
}

export default Register;
