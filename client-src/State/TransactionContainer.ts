import { makeObservable, observable } from 'mobx';
import { isTransactionsResponse, TransactionProps } from '../../common/ResponseTypes';
import {
  QueryManagerInterface, QueryManagerState, StoreInterface, TransactionContainerInterface,
} from './Types';
import Transaction from './Transaction';
import LocalQueryManager from './LocalQueryManager';

class TransactionContainer implements TransactionContainerInterface {
  transactions: Transaction[] = [];

  private transactionsQuery: QueryManagerInterface;

  searchString?: string;

  balanceCallback: ((balance: number, count?: number) => void) | null = null;

  store: StoreInterface;

  constructor(
    store: StoreInterface,
    url: string,
    balanceCallback?: (balance: number, count?: number) => void,
  ) {
    makeObservable(this, {
      transactions: observable,
    })

    this.balanceCallback = balanceCallback ?? null;
    this.store = store;
    this.transactionsQuery = new LocalQueryManager(url);
  }

  state(): QueryManagerState {
    return this.transactionsQuery.state;
  }

  isComplete(): boolean {
    return this.transactionsQuery.fetchComplete;
  }

  async getData(index: number, qs?: string): Promise<void> {
    this.searchString = qs;

    return this.transactionsQuery.fetch(
      index,
      this.transactionResponseHandler,
      qs,
    );
  }

  getMoreData(): Promise<void> {
    return this.getData(this.transactions.length, this.searchString);
  }

  clearTransactions(): void {
    this.transactions = [];
  }

  setTransactions(newTransactions: TransactionProps[]): void {
    const transactions = newTransactions.map((t) => (
      new Transaction(this.store, t)
    ));

    this.transactions = transactions;
  }

  appendTransactions(newTransactions: TransactionProps[]): void {
    const transactions = newTransactions.map((t) => (
      new Transaction(this.store, t)
    ));

    this.transactions = [
      ...this.transactions,
      ...transactions,
    ];
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

  transactionResponseHandler = (body: unknown, idx: number, limit: number): boolean => {
    if (isTransactionsResponse(body)) {
      if (this.balanceCallback) {
        this.balanceCallback(body.balance, body.transactionsCount);
      }

      if (idx === 0) {
        this.setTransactions(body.transactions);
      }
      else if (body.transactions.length > 0) {
        this.appendTransactions(body.transactions);
      }

      return body.transactions.length < limit;
    }

    this.clearTransactions();

    return false;
  }
}

export default TransactionContainer;
