import { makeAutoObservable, runInAction } from 'mobx';
import { StoreInterface } from './State';
import Http from '../Transports/Transports';
import {
  FundingPlanDetailsProps,
  isUpdateFundingCategoryResponse,
} from '../../common/ResponseTypes';
import HistoryGroup from './HistoryGroup';
import FundingPlanCategory from './FundingPlanCategory';

class FundingPlanDetails {
  id: number;

  history: HistoryGroup[];

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
    const oldAmount = category.amount;
    category.amount = amount;

    const response = await Http.put(`/api/funding-plans/${this.id}/item/${category.categoryId}`, {
      amount,
      useGoal: category.useGoal,
      goalDate: category.goalDate,
      recurrence: category.recurrence,
    });

    const body = await response.body();

    if (!response.ok || !isUpdateFundingCategoryResponse(body)) {
      category.amount = oldAmount;
      throw new Error('invalid response');
    }
  }
}

export default FundingPlanDetails;
