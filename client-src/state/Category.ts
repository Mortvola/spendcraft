import { makeAutoObservable, runInAction } from 'mobx';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
  isCategoryTransactionsResponse,
  CategoryType,
  isCategoryLoanResponse,
} from '../../common/ResponseTypes';
import LoanTransaction from './LoanTransaction';
import PendingTransaction from './PendingTransaction';
import { CategoryInterface, StoreInterface } from './State';
import Transaction from './Transaction';
import { getBody, patchJSON } from './Transports';

class Category implements CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  balance: number;

  groupId: number | null = null;

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  } = { balance: 0, transactions: [] };

  store: StoreInterface;

  fetching = false;

  constructor(props: CategoryProps, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.balance = props.balance;
    this.store = store;

    makeAutoObservable(this);
  }

  async getTransactions(): Promise<void> {
    this.fetching = true;
    const response = await fetch(`/api/category/${this.id}/transactions`);

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

      body.loan.transactions.sort((a, b) => {
        if (a.transactionCategory.transaction.date < b.transactionCategory.transaction.date) {
          return 1;
        }

        if (a.transactionCategory.transaction.date > b.transactionCategory.transaction.date) {
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

      runInAction(() => {
        if (body !== null) {
          this.balance = body.balance;
          this.pending = body.pending.map((pt) => new PendingTransaction(pt));
          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
          ));
          this.loan.balance = body.loan.balance;
          this.loan.transactions = body.loan.transactions.map((t) => (
            new LoanTransaction(t)
          ));
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

  async getLoanTransactions(): Promise<void> {
    const response = await fetch(`/api/loans/${this.id}/transactions`);

    if (response.ok) {
      const body = await getBody(response);

      if (isCategoryLoanResponse(body)) {
        body.transactions.sort((a, b) => {
          if (a.transactionCategory.transaction.date < b.transactionCategory.transaction.date) {
            return 1;
          }

          if (a.transactionCategory.transaction.date > b.transactionCategory.transaction.date) {
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

        runInAction(() => {
          if (body !== null) {
            this.loan.balance = body.balance;
            this.loan.transactions = body.transactions.map((t) => (
              new LoanTransaction(t)
            ));
          }
          else {
            this.loan.transactions = [];
          }

          this.fetching = false;
        });
      }
    }
  }

  async update(name: string): Promise<null | Error[]> {
    const response = await patchJSON(`/api/groups/${this.groupId}/categories/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isUpdateCategoryResponse(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
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

export const isCategory = (r: unknown): r is Category => (
  (r as Category).id !== undefined
  && (r as Category).name !== undefined
  && (r as Category).type !== undefined
  && (r as Category).balance !== undefined
  && (r as Category).groupId !== undefined
);

export default Category;
