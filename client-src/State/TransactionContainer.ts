import { makeObservable, observable } from 'mobx';
import { isTransactionsResponse, TransactionProps } from '../../common/ResponseTypes';
import QueryManager from './QueryManager';
import { StoreInterface, TransactionContainerInterface } from './State';
import Transaction from './Transaction';

class TransactionContainer implements TransactionContainerInterface {
  transactions: Transaction[] = [];

  transactionsQuery: QueryManager = new QueryManager();

  url: string;

  searchString?: string;

  balanceCallback: ((balance: number) => void) | null = null;

  store: StoreInterface;

  constructor(
    store: StoreInterface,
    url: string,
    balanceCallback?: (balance: number) => void,
  ) {
    makeObservable(this, {
      transactions: observable,
    })

    this.url = url;
    this.balanceCallback = balanceCallback ?? null;
    this.store = store;
  }

  async getTransactions(index: number, qs?: string): Promise<void> {
    this.searchString = qs;

    return this.transactionsQuery.fetch(
      this.url,
      index,
      this.transactionResponseHandler,
      qs,
    );
  }

  getMoreTransactions(): Promise<void> {
    return this.getTransactions(this.transactions.length, this.searchString);
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
        this.balanceCallback(body.balance);
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
