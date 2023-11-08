import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { StoreInterface } from './State';
import {
  FundingPlanDetailsProps,
  isUpdateFundingCategoryResponse,
} from '../../common/ResponseTypes';
import FundingPlanCategory from './FundingPlanCategory';
import HistoryCategory from './HistoryCategory';

class FundingPlanDetails {
  id: number;

  history: HistoryCategory[];

  categories: FundingPlanCategory[];

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanDetailsProps) {
    this.id = props.id;
    this.history = props.history;

    this.categories = props.categories.map((c) => (
      new FundingPlanCategory(c)
    ));

    makeAutoObservable(this);

    this.store = store;
  }

  async updateCategoryAmount(category: FundingPlanCategory, amount: number): Promise<void> {
    // const oldAmount = category.amount;
    category.amount = amount;

    const response = await Http.put(`/api/v1/funding-plans/item/${category.categoryId}`, {
      amount,
      useGoal: category.useGoal,
      goalDate: category.goalDate,
      recurrence: category.recurrence,
    });

    if (response.ok) {
      const body = await response.body();
      if (isUpdateFundingCategoryResponse(body)) {
        runInAction(() => {
          category.amount = amount;
        })
      }
      else {
        throw new Error('invalid response');
      }
    }
    else {
      throw new Error('invalid response');
    }
  }
}

export default FundingPlanDetails;
