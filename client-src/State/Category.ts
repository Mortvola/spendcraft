import { makeObservable, observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
  CategoryType,
  CategoryBalanceProps,
} from '../../common/ResponseTypes';
import LoanTransaction from './LoanTransaction';
import {
  CategoryInterface, CategoryParams, GroupInterface, StoreInterface,
} from './Types';
import TransactionContainer from './TransactionContainer';

class Category implements CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  group: GroupInterface | null = null;

  balance = 0;

  fundingAmount = 0;

  includeFundingTransfers = true;

  useGoal = false;

  goalDate: DateTime | null = null;

  recurrence = 1;

  fundingCategories: { id: number, categoryId: number, amount: number, percentage: boolean }[];

  transactions: TransactionContainer;

  pendingTransactions: TransactionContainer;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  } = { balance: 0, transactions: [] };

  store: StoreInterface;

  constructor(props: CategoryProps, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.balance = props.balance;
    // this.groupId = props.groupId;
    this.fundingAmount = props.fundingAmount;
    this.includeFundingTransfers = props.includeFundingTransfers;
    this.goalDate = props.goalDate ? DateTime.fromISO(props.goalDate) : null;
    this.useGoal = props.useGoal ?? false;
    this.recurrence = props.recurrence;
    this.fundingCategories = props.fundingCategories.map((c, index) => ({ id: index, ...c }));
    this.store = store;

    this.transactions = new TransactionContainer(
      store,
      `/api/v1/category/${props.id}/transactions?pending=2`,
      (balance: number, count?: number) => {
        this.balance = balance;

        if (this.type === CategoryType.Unassigned) {
          if (navigator.setAppBadge) {
            if (count) {
              navigator.setAppBadge(count)
            }
            else {
              navigator.clearAppBadge()
            }
          }
        }
      },
    );

    this.pendingTransactions = new TransactionContainer(
      store, `/api/v1/category/${props.id}/transactions?pending=1`,
    );

    makeObservable(this, {
      name: observable,
      balance: observable,
    });
  }

  getFundingPool(): CategoryInterface {
    if (this.group === null) {
      throw new Error('group not set')
    }

    return this.group.getFundingPool()
  }

  async update(
    params: CategoryParams,
  ): Promise<null | Error[]> {
    const {
      group, goalDate, fundingCategories, ...p
    } = params;

    const response = await Http.patch(`/api/v1/groups/${group.id}/categories/${this.id}`, {
      ...p,
      fundingCategories:
        p.type === CategoryType.Bill
          ? fundingCategories
          : [],
      goalDate: goalDate?.toISODate(),
      hidden: false,
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
          this.type = body.type;
          this.name = body.name;
          this.fundingAmount = body.fundingAmount;
          this.includeFundingTransfers = body.includeFundingTransfers;
          this.recurrence = body.recurrence;
          this.goalDate = DateTime.fromISO(body.goalDate);
          this.fundingCategories = body.fundingCategories.map((c, index) => ({ id: index, ...c }));

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

      if (this.type === CategoryType.Unassigned) {
        if (navigator.setAppBadge) {
          if (balance.count) {
            navigator.setAppBadge(balance.count)
          }
          else {
            navigator.clearAppBadge()
          }
        }
      }
    }
  }

  async delete (): Promise<null | Error[]> {
    const response = await Http.delete(`/api/v1/groups/${this.group!.id}/categories/${this.id}`);

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
  (r as Category)?.id !== undefined
  && (r as Category)?.name !== undefined
  && (r as Category)?.type !== undefined
  && (r as Category)?.balance !== undefined
);

export default Category;
