import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import { isAccountTransactionsResponse, TransactionProps, TransactionType } from '../../common/ResponseTypes';
import { StoreInterface } from './State';
import { getBody, httpGet } from './Transports';

type BaseType = {
  id: number | null,
  type: TransactionType,
  date: DateTime,
}

class TransactionContainer<T extends BaseType> {
  transactions: T[] = [];

  balance = 0;

  fetching = false;

  fetchComplete = false;

  store: StoreInterface;

  TrxType: new(store: StoreInterface, props: TransactionProps) => T;

  constructor(
    T: new(store: StoreInterface, props: TransactionProps) => T,
    store: StoreInterface,
  ) {
    makeAutoObservable(this);

    this.TrxType = T;

    this.store = store;
  }

  async getTransactions(this: TransactionContainer<T>, url: string, index = 0): Promise<void> {
    if (index === 0) {
      this.fetchComplete = false;
    }

    if (!this.fetching && !this.fetchComplete) {
      this.fetching = true;
      const limit = 30;
      const response = await httpGet(`${url}?offset=${index ?? 0}&limit=${limit}`);

      const body = await getBody(response);

      if (response.ok && (body)) {
        runInAction(() => {
          if (isAccountTransactionsResponse(body)) {
            this.balance = body.balance;
            // this.pending = body.pending.map((pt) => new PendingTransaction(pt));
            const transactions = body.transactions.map((t) => (
              new this.TrxType(this.store, t)
            ));

            if (index === 0) {
              this.transactions = transactions;
            }
            else {
              this.transactions = [
                ...this.transactions,
                ...transactions,
              ];
            }

            if (transactions.length < limit) {
              this.fetchComplete = true;
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

  insertTransaction(transaction: T): void {
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
