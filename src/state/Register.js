import { makeAutoObservable, runInAction } from 'mobx';
import Transaction from './Transaction';

class Register {
  constructor(store) {
    this.categoryId = null;
    this.account = null;
    this.fetching = false;
    this.transactions = [];
    this.pending = [];
    this.balance = 0;

    makeAutoObservable(this);

    this.store = store;
  }

  async loadCategoryTransactions(categoryId) {
    if (categoryId !== this.categoryId) {
      this.fetching = true;
      const response = await fetch(`/category/${categoryId}/transactions`);

      let body = null;
      if (/^application\/json/.test(response.headers.get('Content-Type'))) {
        body = await response.json();
      }

      if (response.ok && body) {
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
          this.balance = body.balance;
          this.pending = body.pending;
          this.fetching = false;

          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
          ));
        });
      }
      else {
        this.fetching = false;
      }
    }
  }

  async loadAccountTransactions(account) {
    if (account !== this.account) {
      this.fetching = true;
      const response = await fetch(`/account/${account.id}/transactions`);

      let body = null;
      if (/^application\/json/.test(response.headers.get('Content-Type'))) {
        body = await response.json();
      }

      if (response.ok && body) {
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
          this.balance = body.balance;
          this.pending = body.pending;

          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
          ));

          this.fetching = false;
        });
      }
      else {
        this.fetching = false;
      }
    }
  }

  updateTransactionCategories(transactionId, splits, balances) {
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
      const balance = balances.find((b) => b.id === this.categoryId);

      if (balance) {
        this.balance = balance.amount;
      }
    }
  }
}

export default Register;
