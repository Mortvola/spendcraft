import { makeAutoObservable, runInAction } from 'mobx';
import { isAccountTransactionsResponse } from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import { StoreInterface } from './State';
import Transaction from './Transaction';
import { getBody, httpGet } from './Transports';

class TransactionContainer {
  transactions: Transaction[] = [];

  balance = 0;

  fetching = false;

  fetchComplete = false;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async getTransactions(url: string, index = 0): Promise<void> {
    if (index === 0) {
      this.fetchComplete = false;
    }

    if (!this.fetching && !this.fetchComplete) {
      this.fetching = true;
      const limit = 30;
      const response = await httpGet(`${url}?offset=${index ?? 0}&limit=${limit}`);

      const body = await getBody(response);

      if (response.ok && isAccountTransactionsResponse(body)) {
        runInAction(() => {
          if (body !== null) {
            this.balance = body.balance;
            // this.pending = body.pending.map((pt) => new PendingTransaction(pt));
            const transactions = body.transactions.map((t) => (
              new Transaction(this.store, t)
            ));

            if (transactions.length < limit) {
              this.fetchComplete = true;
            }

            // Account.sort(this.transactions);
            // TransactionContainer.sort(this.pending);

            if (index === 0) {
              this.transactions = transactions;
            }
            else {
              this.transactions = [
                ...this.transactions,
                ...transactions,
              ];
            }
          }
          else {
            this.transactions = [];
          }

          this.fetching = false;
        });
      }
      else {
        this.fetching = false;
      }
    }
  }

  getMoreTransactions(url: string): Promise<void> {
    return this.getTransactions(url, this.transactions.length);
  }

  static sort(t: Transaction[] | PendingTransaction[]): void {
    t.sort((a, b) => {
      if (a.date < b.date) {
        return 1;
      }

      if (a.date > b.date) {
        return -1;
      }

      // if (a.sortOrder < b.sortOrder) {
      //   return 1;
      // }

      // if (a.sortOrder > b.sortOrder) {
      //   return -1;
      // }

      return 0;
    });
  }

  insertTransaction(transaction: Transaction): void {
    const index = this.transactions.findIndex((t) => transaction.date >= t.date);

    if (index === -1) {
      this.transactions.push(transaction);
    }
    else {
      this.transactions.splice(index, 0, transaction)
    }
  }

  removeTransaction(transactionId: number): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      this.transactions.splice(index, 1);
    }
  }
}

export default TransactionContainer;
