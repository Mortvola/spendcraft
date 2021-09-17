import { DateTime } from 'luxon';
import { makeAutoObservable } from 'mobx';
import { TransactionProps, TransactionType } from '../../common/ResponseTypes';
import { StoreInterface, TransactionContainerInterface } from './State';

type BaseType = {
  id: number | null,
  type: TransactionType,
  date: DateTime,
}

class TransactionContainer<T extends BaseType> implements TransactionContainerInterface<T> {
  transactions: T[] = [];

  balance = 0;

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

  clear(): void {
    this.transactions = [];
  }

  setTransactions(newTransactions: TransactionProps[]): void {
    const transactions = newTransactions.map((t) => (
      new this.TrxType(this.store, t)
    ));

    this.transactions = transactions;
  }

  appendTransactions(newTransactions: TransactionProps[]): void {
    // this.pending = body.pending.map((pt) => new PendingTransaction(pt));
    const transactions = newTransactions.map((t) => (
      new this.TrxType(this.store, t)
    ));

    this.transactions = [
      ...this.transactions,
      ...transactions,
    ];
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
