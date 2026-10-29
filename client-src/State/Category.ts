import { formatMoneyCents, parseMoneyCents, addMoneyCents, type MoneyCents } from
  '../../common/moneyCents';
import { decodeCentFundingRules, encodeCentFundingRules, type CentFundingRule } from '../monetary';
import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  CategoryProps, isErrorResponse, ErrorProps,
  CategoryType,
  CategoryBalanceProps,
  ApiResponse,
  UpdateCategoryResponse,
  CategoryWriteRequest,
} from '../../common/ResponseTypes';
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
  accessor balanceCents = parseMoneyCents('0.00');

  @observable
  accessor suspended = false;

  fundingAmountCents = parseMoneyCents('0.00');

  includeFundingTransfers = true;

  useGoal = false;

  goalDate: DateTime | null = null;

  recurrence = 1;

  fundingCategories: (CentFundingRule & { id: number })[];

  transactions: TransactionContainer;

  pendingTransactions: TransactionContainer;

  @observable
  accessor hidden = false;

  store: StoreInterface;

  constructor(props: CategoryProps, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.balanceCents = parseMoneyCents(props.balance);
    this.suspended = props.suspended;
    this.fundingAmountCents = parseMoneyCents(props.fundingAmount);
    this.includeFundingTransfers = props.includeFundingTransfers;
    this.goalDate = props.goalDate ? DateTime.fromISO(props.goalDate) : null;
    this.useGoal = props.useGoal ?? false;
    this.recurrence = props.recurrence;
    this.fundingCategories = decodeCentFundingRules(props.fundingCategories).map((c, index) => ({
      id: index, ...c }));
    this.hidden = props.hidden;
    this.store = store;

    this.transactions = new TransactionContainer(
      store,
      `/api/v1/category/${props.id}/transactions?pending=2`,
      (balance: string, count?: number) => {
        this.balanceCents = parseMoneyCents(balance);

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

  getTotalBalanceCents(): MoneyCents {
    const subcatSum = this.subcategories.reduce((prev, current) => addMoneyCents(prev, current
      .balanceCents), parseMoneyCents('0.00'))
    return addMoneyCents(this.balanceCents, subcatSum);
  }

  async update(
    params: CategoryParams,
  ): Promise<null | ErrorProps[]> {
    const {
      group, goalDate, fundingCategories, fundingAmountCents, ...p
    } = params;

    const response = await Http.patch<CategoryWriteRequest, ApiResponse<UpdateCategoryResponse>>(
      `/api/v1/groups/${group.id}/categories/${this.id}`, {
      ...p,
      fundingAmount: fundingAmountCents === undefined ? undefined : formatMoneyCents(
        fundingAmountCents),
      fundingCategories:
        p.type === CategoryType.Bill
          ? encodeCentFundingRules(fundingCategories)
          : [],
      goalDate: goalDate?.toISODate(),
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
      const fundingAmount = body.data ? parseMoneyCents(body.data.fundingAmount) : undefined;
      const fundingCategories = body.data ? decodeCentFundingRules(body.data
        .fundingCategories) : undefined;
      runInAction(() => {
        if (body.data && fundingAmount !== undefined && fundingCategories !== undefined) {
          const nameChanged = this.name !== body.data.name;
          this.type = body.data.type;
          this.name = body.data.name;
          this.suspended = body.data.suspended;
          this.fundingAmountCents = fundingAmount;
          this.includeFundingTransfers = body.data.includeFundingTransfers;
          this.recurrence = body.data.recurrence;
          this.goalDate = DateTime.fromISO(body.data.goalDate);
          this.fundingCategories = fundingCategories.map((c, index) => ({ id: index, ...c }));

          this.hidden = body.data.hidden;

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
    this.balanceCents = parseMoneyCents(balance.balance);

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

  computedGoalDate(): DateTime | null {
    if (this.useGoal && this.goalDate) {
      let adjustedGoal = this.goalDate
      const now = DateTime.now().startOf('month');

      const monthDiff = this.goalDate.startOf('month').diff(now, 'months').months;
      if (monthDiff < 0) {
        const numPeriods = Math.ceil(-monthDiff / this.recurrence);
        adjustedGoal = this.goalDate.plus({ months: numPeriods * this.recurrence })
      }

      return adjustedGoal;
    }

    return null;
  }
}

export const isCategory = (r: unknown): r is Category => (
  (r as Category)?.id !== undefined
  && (r as Category)?.name !== undefined
  && (r as Category)?.type !== undefined
  && (r as Category)?.balanceCents !== undefined
);

export default Category;
