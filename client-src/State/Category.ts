import { makeObservable, observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
  CategoryType,
  CategoryBalanceProps,
} from '../../common/ResponseTypes';
import LoanTransaction from './LoanTransaction';
import { CategoryInterface, GroupInterface, StoreInterface } from './State';
import TransactionContainer from './TransactionContainer';

class Category extends TransactionContainer implements CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  monthlyExpenses: boolean;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  } = { balance: 0, transactions: [] };

  store: StoreInterface;

  constructor(props: CategoryProps, store: StoreInterface) {
    super(store, `/api/category/${props.id}/transactions`);

    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.groupId = props.groupId;
    this.balance = props.balance;
    this.monthlyExpenses = props.monthlyExpenses;
    this.store = store;

    makeObservable(this, {
      name: observable,
    });
  }

  async getPendingTransactions(index = 0): Promise<void> {
    return this.pendingQuery.fetch(
      `/api/category/${this.id}/transactions/pending`,
      index,
      this.pendingResponseHandler,
    )
  }

  async update(
    name: string,
    group: GroupInterface,
    monthlyExpenses: boolean,
  ): Promise<null | Error[]> {
    const response = await Http.patch(`/api/groups/${group.id}/categories/${this.id}`, {
      name,
      monthlyExpenses,
    });

    const body = await response.body();

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
          this.monthlyExpenses = body.monthlyExpenses;

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

  updateBalances(balances: CategoryBalanceProps[]): void {
    const balance = balances.find((b) => b.id === this.id);
    if (balance) {
      this.balance = balance.balance;
    }
  }

  async delete (): Promise<null | Error[]> {
    const response = await Http.delete(`/api/groups/${this.groupId}/categories/${this.id}`);

    if (!response.ok) {
      const body = await response.body();

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
