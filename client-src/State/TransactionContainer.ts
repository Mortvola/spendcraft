import { makeObservable, observable } from 'mobx';
import { isPendingTransactionsResponse, isTransactionsResponse, TransactionProps } from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import QueryManager from './QueryManager';
import { StoreInterface, TransactionContainerInterface } from './State';
import Transaction from './Transaction';

class TransactionContainer implements TransactionContainerInterface {
  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  balance = 0;

  transactionsQuery: QueryManager = new QueryManager();

  pendingQuery: QueryManager = new QueryManager();

  store: StoreInterface;

  constructor(
    store: StoreInterface,
  ) {
    makeObservable(this, {
      transactions: observable,
      pending: observable,
      balance: observable,
    })

    this.store = store;
  }

  clearTransactions(): void {
    this.transactions = [];
  }

  clearPending(): void {
    this.pending = [];
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

  setPendingTransactions(newTransactions: TransactionProps[]): void {
    const pending = newTransactions.map((t) => (
      new PendingTransaction(this.store, t)
    ));

    this.pending = pending;
  }

  appendPendingTransactions(newTransactions: TransactionProps[]): void {
    const pending = newTransactions.map((t) => (
      new PendingTransaction(this.store, t)
    ));

    this.pending = [
      ...this.pending,
      ...pending,
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
      this.balance = body.balance;

      if (body.transactions.length > 0) {
        if (idx === 0) {
          this.setTransactions(body.transactions);
        }
        else {
          this.appendTransactions(body.transactions);
        }
      }

      return body.transactions.length < limit;
    }

    this.clearTransactions();

    return false;
  }

  pendingResponseHandler = (body: unknown, idx: number, limit: number): boolean => {
    if (isPendingTransactionsResponse(body)) {
      if (idx === 0) {
        this.setPendingTransactions(body);
      }
      else {
        this.appendPendingTransactions(body);
      }

      return body.length < limit;
    }

    this.clearPending();

    return false;
  }
}

export default TransactionContainer;
