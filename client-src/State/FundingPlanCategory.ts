import { DateTime } from 'luxon';
import { makeAutoObservable } from 'mobx';
import { FundingPlanCategoryProps } from '../../common/ResponseTypes';
import { CategoryInterface } from './State';

class FundingPlanCategory {
  id?: number;

  amount: number;

  categoryId: number;

  useGoal: boolean;

  goalDate: DateTime = DateTime.now();

  recurrence: number;

  constructor(props: FundingPlanCategoryProps) {
    this.id = props.id;

    this.amount = props.amount;

    this.categoryId = props.categoryId;

    this.useGoal = props.useGoal;

    if (props.goalDate) {
      this.goalDate = DateTime.fromISO(props.goalDate);
    }

    this.recurrence = props.recurrence;

    makeAutoObservable(this);
  }

  static computeMonthlyAmount(category: CategoryInterface, goalAmount: number, monthsToGoal: number): number {
    const remaining = goalAmount - Math.min(goalAmount, (category ? category.balance : 0));

    return (
      monthsToGoal === 0
        ? remaining
        : Math.ceil((remaining / monthsToGoal) * 100) / 100
    );
  }

  static sanitizeGoalDate(goalDate: string | null): string {
    if (goalDate === '' || goalDate === null) {
      const gd = DateTime.now().startOf('month').plus({ months: 1 }).toISODate();

      if (gd === null) {
        throw new Error('gd is null')
      }

      return gd;
    }

    return goalDate;
  }

  static computeMonths(goalDate: string | null): number {
    const date = DateTime.fromISO(FundingPlanCategory.sanitizeGoalDate(goalDate)).startOf('month');
    const lastFunding = DateTime.now().startOf('month');
    const duration = date.diff(lastFunding, 'months');

    return Math.max(0, duration.months);
  }

  monthlyAmount(category: CategoryInterface): number {
    return this.useGoal
      ? FundingPlanCategory
        .computeMonthlyAmount(
          category, this.amount, FundingPlanCategory.computeMonths(this.goalDate.toISODate()),
        )
      : this.amount;
  }
}

export default FundingPlanCategory;
