import { runInAction } from 'mobx';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import Transaction from './Transaction';
import {
  ApiResponse,
  CategoryTransferProps,
  isInsertCategoryTransferResponse, TransactionType,
} from '../../common/ResponseTypes';
import {
  RegisterInterface, StoreInterface,
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

  removeTransaction(transactionId: number): void {
    if (this.store.uiState.selectedCategory) {
      this.store.uiState.selectedCategory.transactions.removeTransaction(transactionId);
    }

    if (this.store.uiState.selectedAccount) {
      this.store.uiState.selectedAccount.transactions.removeTransaction(transactionId);
    }
  }
}

export default Register;
