import { makeAutoObservable, runInAction } from 'mobx';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
  isCategoryTransactionsResponse,
  CategoryType,
} from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import { CategoryInterface, StoreInterface, TransactionCategoryInterface } from './State';
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

      runInAction(() => {
        if (body !== null) {
          this.balance = body.balance;
          this.pending = body.pending.map((pt) => new PendingTransaction(pt));
          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
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

  async update(groupId: number, name: string): Promise<null | Array<Error>> {
    const response = await patchJSON(`/api/groups/${groupId}/categories/${this.id}`, { name });

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

  updateTransactionCategories(
    transactionId: number,
    categories: TransactionCategoryInterface[],
    balances: CategoryProps[],
  ): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      // If the new transaction categories don't include
      // the current category then remove the transactions.
      if (!categories.some((c) => (
        c.categoryId === this.id
      ))) {
        this.transactions.splice(index, 1);
      }
      else {
        this.transactions[index].categories = categories;
      }
    }

    const category = balances.find((c) => c.id === this.id);

    if (category) {
      // this.balance = category.balance;
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
