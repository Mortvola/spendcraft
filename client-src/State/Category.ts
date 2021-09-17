import { makeAutoObservable, runInAction } from 'mobx';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
  CategoryType,
  CategoryBalanceProps,
  isTransactionsResponse,
  isPendingTransactionsResponse,
} from '../../common/ResponseTypes';
import LoanTransaction from './LoanTransaction';
import PendingTransaction from './PendingTransaction';
import QueryManager from './QueryManager';
import { CategoryInterface, GroupInterface, StoreInterface } from './State';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';
import {
  getBody, httpDelete, httpPatch,
} from './Transports';

class Category implements CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  balance: number;

  // groupId: number | null = null;

  transactions: TransactionContainer<Transaction>;

  transactionsQuery: QueryManager = new QueryManager();

  pending: TransactionContainer<PendingTransaction>;

  pendingQuery: QueryManager = new QueryManager();

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  } = { balance: 0, transactions: [] };

  store: StoreInterface;

  constructor(props: CategoryProps, store: StoreInterface) {
    this.transactions = new TransactionContainer(Transaction, store);
    this.pending = new TransactionContainer(PendingTransaction, store);

    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.groupId = props.groupId;
    this.balance = props.balance;
    this.store = store;

    makeAutoObservable(this);
  }

  async getTransactions(index = 0): Promise<void> {
    return this.transactionsQuery.fetch(
      `/api/category/${this.id}/transactions`,
      index,
      (body: unknown, idx: number, limit: number) => {
        if (isTransactionsResponse(body)) {
          this.balance = body.balance;

          if (idx === 0) {
            this.transactions.setTransactions(body.transactions);
          }
          else {
            this.transactions.appendTransactions(body.transactions);
          }

          return body.transactions.length < limit;
        }

        this.transactions.clear();

        return false;
      },
    );
  }

  getMoreTransactions(): Promise<void> {
    return this.getTransactions(this.transactions.transactions.length);
  }

  async getPendingTransactions(index = 0): Promise<void> {
    return this.pendingQuery.fetch(
      `/api/category/${this.id}/transactions/pending`,
      index,
      (body: unknown, idx: number, limit: number) => {
        if (isPendingTransactionsResponse(body)) {
          if (idx === 0) {
            this.pending.setTransactions(body);
          }
          else {
            this.pending.appendTransactions(body);
          }

          return body.length < limit;
        }

        this.pending.clear();

        return false;
      },
    )
  }

  async update(name: string, group: GroupInterface): Promise<null | Error[]> {
    const response = await httpPatch(`/api/groups/${group.id}/categories/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isUpdateCategoryResponse(body)) {
          const nameChanged = this.name !== body.name;
          this.name = body.name;

          // Find the group the category is currently in
          // and possibly move it to the new group.
          const currentGroup = this.store.categoryTree.getCategoryGroup(this.id);

          if (currentGroup !== group) {
            group.insertCategory(this);
            currentGroup.removeCategory(this);
          }
          else if (nameChanged) {
            group.removeCategory(this);
            group.insertCategory(this);
          }
        }
      });
    }

    return null;
  }

  insertTransaction(transaction: Transaction): void {
    this.transactions.insertTransaction(transaction);
  }

  removeTransaction(transactionId: number): void {
    this.transactions.removeTransaction(transactionId);
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    const balance = balances.find((b) => b.id === this.id);
    if (balance) {
      this.balance = balance.balance;
    }
  }

  async delete (): Promise<null | Error[]> {
    const response = await httpDelete(`/api/groups/${this.groupId}/categories/${this.id}`);

    if (!response.ok) {
      const body = await getBody(response);

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        const group = this.store.categoryTree.getCategoryGroup(this.id);
        group.removeCategory(this);
      });
    }

    return null;
  }

  getGroup(): GroupInterface {
    return this.store.categoryTree.getCategoryGroup(this.id);
  }
}

export const isCategory = (r: unknown): r is Category => (
  r !== undefined && r !== null
  && (r as Category).id !== undefined
  && (r as Category).name !== undefined
  && (r as Category).type !== undefined
  && (r as Category).balance !== undefined
  // && (r as Category).groupId !== undefined
);

export default Category;