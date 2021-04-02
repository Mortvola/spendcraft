import { makeAutoObservable, runInAction } from 'mobx';
import Transaction from './Transaction';
import {
  isAccountTransactionsResponse,
  CategoryProps,
  isCategoryTransactionsResponse,
} from '../../common/ResponseTypes';
import {
  RegisterInterface, StoreInterface, TransactionCategoryInterface,
} from './State';
import { getBody } from './Transports';
import PendingTransaction from './PendingTransaction';

class Register implements RegisterInterface {
  categoryId: number | null = null;

  account: Account | null = null;

  fetching = false;

  transactions: Array<Transaction> = [];

  pending: Array<PendingTransaction> = [];

  balance = 0;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async loadCategoryTransactions(categoryId: number | null): Promise<void> {
    if (categoryId !== null && categoryId !== this.categoryId) {
      this.fetching = true;
      const response = await fetch(`/category/${categoryId}/transactions`);

      const body = await getBody(response);

      if (response.ok && isCategoryTransactionsResponse(body)) {
        body.transactions.sort((a, b) => {
          if (a.date < b.date) {
            return 1;
          }

          if (a.date > b.date) {
            return -1;
          }

          if (a.sortOrder < b.sortOrder) {
            return 1;
          }

          if (a.sortOrder > b.sortOrder) {
            return -1;
          }

          return 0;
        });

        runInAction(() => {
          this.categoryId = categoryId;
          this.account = null;
          if (body !== null) {
            this.balance = body.balance;
            this.pending = body.pending.map((pt) => new PendingTransaction(pt));
            this.transactions = body.transactions.map((t) => (
              new Transaction(this.store, t)
            ));
          }

          this.fetching = false;
        });
      }
      else {
        this.fetching = false;
      }
    }
  }

  async loadAccountTransactions(account: Account): Promise<void> {
    if (account !== this.account) {
      this.fetching = true;
      const response = await fetch(`/account/${account.id}/transactions`);

      const body = await getBody(response);

      if (response.ok && isAccountTransactionsResponse(body)) {
        body.transactions.sort((a, b) => {
          if (a.date < b.date) {
            return 1;
          }

          if (a.date > b.date) {
            return -1;
          }

          if (a.sortOrder < b.sortOrder) {
            return 1;
          }

          if (a.sortOrder > b.sortOrder) {
            return -1;
          }

          return 0;
        });

        runInAction(() => {
          this.categoryId = null;
          this.account = account;

          if (body !== null) {
            this.balance = body.balance;
            this.pending = body.pending;

            this.transactions = body.transactions.map((t) => (
              new Transaction(this.store, t)
            ));
          }

          this.fetching = false;
        });
      }
      else {
        this.fetching = false;
      }
    }
  }

  updateTransactionCategories(
    transactionId: number,
    splits: Array<TransactionCategoryInterface>,
    categories: Array<CategoryProps>,
  ): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      // If the new transaction categories don't include
      // the current category then remove the transactions.
      if (
        this.categoryId !== null
        && !splits.some((c) => (
          c.categoryId === this.categoryId
        ))
      ) {
        this.transactions.splice(index, 1);
      }
      else {
        this.transactions[index].categories = splits;
      }
    }

    if (this.categoryId !== null) {
      const category = categories.find((c) => c.id === this.categoryId);

      if (category) {
        this.balance = category.balance;
      }
    }
  }
}

export default Register;
