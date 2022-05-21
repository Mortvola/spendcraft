import { makeAutoObservable, runInAction } from 'mobx';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import Transaction from './Transaction';
import {
  CategoryTransferProps,
  isInsertCategoryTransferResponse, TransactionType,
} from '../../common/ResponseTypes';
import {
  RegisterInterface, StoreInterface,
} from './State';

class Register implements RegisterInterface {
  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async addCategoryTransfer(
    values: {
      categories: CategoryTransferProps[];
      date: string;
    },
    type: TransactionType,
  ): Promise<null> {
    const response = await Http.post('/api/category-transfer', { ...values, type });

    const body = await response.body();

    if (isInsertCategoryTransferResponse(body)) {
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
          let index = this.store.uiState.selectedCategory.transactions.findIndex(
            (t) => t.date <= DateTime.fromISO(values.date),
          );

          // If the index was not found then insert at the end of the list of transactions.
          if (index === -1) {
            index = this.store.uiState.selectedCategory.transactions.length;
          }

          this.store.uiState.selectedCategory.transactions = [
            ...this.store.uiState.selectedCategory.transactions.slice(0, index),
            new Transaction(this.store, body.transaction),
            ...this.store.uiState.selectedCategory.transactions.slice(index),
          ];
        }

        this.store.categoryTree.updateBalances(body.balances);

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
      this.store.uiState.selectedCategory.removeTransaction(transactionId);
    }

    if (this.store.uiState.selectedAccount) {
      this.store.uiState.selectedAccount.removeTransaction(transactionId);
    }
  }
}

export default Register;
