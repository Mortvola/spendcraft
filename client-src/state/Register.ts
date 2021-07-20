import { makeAutoObservable, runInAction } from 'mobx';
import { DateTime } from 'luxon';
import Transaction from './Transaction';
import {
  isAccountTransactionsResponse,
  CategoryProps,
  isCategoryTransactionsResponse,
  isInsertCategoryTransferResponse,
} from '../../common/ResponseTypes';
import {
  RegisterInterface, StoreInterface, TransactionCategoryInterface,
} from './State';
import { getBody, postJSON } from './Transports';
import PendingTransaction from './PendingTransaction';
import Account from './Account';

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
    categories: TransactionCategoryInterface[],
    balances: CategoryProps[],
  ): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      // If the new transaction categories don't include
      // the current category then remove the transactions.
      if (
        this.categoryId !== null
        && !categories.some((c) => (
          c.categoryId === this.categoryId
        ))
      ) {
        this.transactions.splice(index, 1);
      }
      else {
        this.transactions[index].categories = categories;
      }
    }

    if (this.categoryId !== null) {
      const category = balances.find((c) => c.id === this.categoryId);

      if (category) {
        this.balance = category.balance;
      }
    }
  }

  async addCategoryTransaction(
    values: {
      categories: TransactionCategoryInterface[];
      date: string;
    },
  ): Promise<null> {
    const response = await postJSON('/category_transfer', { ...values, type: 3 });

    const body = await getBody(response);

    if (isInsertCategoryTransferResponse(body)) {
      runInAction(() => {
        // If the new transaction categories include
        // the current category then insert the transaction.
        if (
          this.categoryId !== null
          && values.categories.some((c) => (
            c.categoryId === this.categoryId
          ))
        ) {
          // Determine where to insert the transaction based on date.
          let index = this.transactions.findIndex(
            (t) => DateTime.fromISO(t.date) <= DateTime.fromISO(values.date),
          );

          // If the index was not found then insert at the end of the list of transactions.
          if (index === -1) {
            index = this.transactions.length;
          }

          this.transactions = [
            ...this.transactions.slice(0, index),
            new Transaction(this.store, body.transaction),
            ...this.transactions.slice(index),
          ];
        }

        this.store.categoryTree.updateBalances(body.balances);

        if (this.categoryId !== null) {
          const category = body.balances.find((c) => c.id === this.categoryId);

          if (category) {
            this.balance = category.balance;
          }
        }
      });

      return null;
    }

    throw new Error('invalid response');
  }

  removeTransaction(transactionId: number): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      this.transactions.splice(index, 1);
    }
  }
}

export default Register;
