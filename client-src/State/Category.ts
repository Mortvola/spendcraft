import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  CategoryProps, isErrorResponse, ErrorProps,
  CategoryType,
  CategoryBalanceProps,
  ApiResponse,
  UpdateCategoryResponse,
} from '../../common/ResponseTypes';
import LoanTransaction from './LoanTransaction';
import {
  CategoryInterface, CategoryParams, GroupInterface, StoreInterface,
} from './Types';
import TransactionContainer from './TransactionContainer';

class Category implements CategoryInterface {
  id: number;

  @observable
  accessor name: string;

  type: CategoryType;

  group: GroupInterface | null = null;

  subcategories: Category[] = [];

  @observable
  accessor balance = 0;

  suspended = false;

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
    this.suspended = props.suspended;
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
  }

  getFundingPool(): CategoryInterface {
    if (this.group === null) {
      throw new Error('group not set')
    }

    return this.group.getFundingPool()
  }

  getTotalBalance(): number {
    const subcatSum = this.subcategories.reduce((prev, current) => prev + current.balance, 0)
    return this.balance + subcatSum;
  }

  async update(
    params: CategoryParams,
  ): Promise<null | ErrorProps[]> {
    const {
      group, goalDate, fundingCategories, ...p
    } = params;

    const response = await Http.patch<unknown, ApiResponse<UpdateCategoryResponse>>(`/api/v1/groups/${group.id}/categories/${this.id}`, {
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
      if (body.errors) {
        return body.errors.map((error) => ({
          field: error.source?.pointer ?? '',
          message: error.detail,
          rule: error.code,
        }));
      }
    }
    else {
      runInAction(() => {
        if (body.data) {
          const nameChanged = this.name !== body.data.name;
          this.type = body.data.type;
          this.name = body.data.name;
          this.suspended = body.data.suspended;
          this.fundingAmount = body.data.fundingAmount;
          this.includeFundingTransfers = body.data.includeFundingTransfers;
          this.recurrence = body.data.recurrence;
          this.goalDate = DateTime.fromISO(body.data.goalDate);
          this.fundingCategories = body.data.fundingCategories.map((c, index) => ({ id: index, ...c }));

          // Find the group the category is currently in
          // and possibly move it to the new group.
          const currentGroup = this.store.categoryTree.getCategoryGroup(this.id);

          if (currentGroup !== group) {
            group.insertChild(this);
            currentGroup.removeChild(this);
          }
          else if (nameChanged) {
            group.removeChild(this);
            group.insertChild(this);
          }
        }
      });
    }

    return null;
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    const balance = balances.find((b) => b.id === this.id);
    if (balance) {
      this.updateBalance(balance)
    }
  }

  updateBalance(balance: CategoryBalanceProps) {
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

  async delete (): Promise<null | ErrorProps[]> {
    if (this.group === null) {
      throw new Error('group is null')
    }

    const response = await Http.delete(`/api/v1/groups/${this.group.id}/categories/${this.id}`);

    if (!response.ok) {
      const body = await response.body();

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        const group = this.store.categoryTree.getCategoryGroup(this.id);
        group.removeChild(this);
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
