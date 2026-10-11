import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { FundingPlanDetailsInterface, StoreInterface } from './Types';
import {
  FundingPlanDetailsProps,
  isUpdateFundingCategoryResponse,
} from '../../common/ResponseTypes';
import FundingPlanCategory from './FundingPlanCategory';
import HistoryCategory from './HistoryCategory';

class FundingPlanDetails implements FundingPlanDetailsInterface {
  @observable
  accessor id: number;

  @observable
  accessor history: HistoryCategory[];

  @observable
  accessor categories: FundingPlanCategory[];

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanDetailsProps) {
    this.id = props.id;
    this.history = props.history;

    this.categories = props.categories.map((c) => (
      new FundingPlanCategory(c)
    ));

    this.store = store;
  }

   
  async updateCategoryAmount(category: FundingPlanCategory, amount: number): Promise<void> {
    const response = await Http.put(`/api/v1/funding-plans/item/${category.categoryId}`, {
      amount,
      useGoal: category.useGoal,
      goalDate: category.goalDate,
      recurrence: category.recurrence,
    });

    if (response.ok) {
      const body = await response.body();
      if (isUpdateFundingCategoryResponse(body) && body.id === category.categoryId
        && Number.isFinite(body.fundingAmount)) {
        runInAction(() => {
          category.amount = body.fundingAmount;
          const cachedCategory = this.store.categoryTree.getCategory(category.categoryId);
          if (cachedCategory) cachedCategory.fundingAmount = body.fundingAmount;
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
