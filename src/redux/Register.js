import { makeAutoObservable, runInAction } from 'mobx';

class Register {
  constructor() {
    this.categoryId = null;
    this.fetching = false;
    this.transactions = [];
    this.pending = [];
    this.balance = 0;

    makeAutoObservable(this);
  }

  async loadCategoryTransactions(categoryId) {
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
        this.transactions = body.transactions;
        this.balance = body.balance;
        this.pending = body.pending;
        this.fetching = false;
      });
    }
    else {
      this.fetching = false;
    }
  }
}

export default Register;
