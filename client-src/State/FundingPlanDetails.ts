import { makeAutoObservable, runInAction } from 'mobx';
import FundingPlanGroup from './FundingPlanGroup';
import { StoreInterface } from './State';
import { getBody, httpPut } from './Transports';
import {
  FundingPlanDetailsProps,
  isUpdateFundingCategoryResponse,
} from '../../common/ResponseTypes';
import HistoryGroup from './HistoryGroup';
import FundingPlanCategory from './FundingPlanCategory';

class FundingPlanDetails {
  id: number;

  history: HistoryGroup[];

  total: number;

  categories: FundingPlanCategory[];

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanDetailsProps) {
    this.id = props.id;
    this.history = props.history;

    let total = 0;
    this.categories = props.categories.map((c) => {
      total += c.amount;
      return new FundingPlanCategory(store, c)
    });

    this.total = total;

    makeAutoObservable(this);

    this.store = store;
  }

  async updateCategoryAmount(categoryId: number, amount: number, delta: number): Promise<void> {
    const response = await httpPut(`/api/funding-plans/${this.id}/item/${categoryId}`, { amount });

    const body = await getBody(response);

    if (response.ok && isUpdateFundingCategoryResponse(body)) {
      runInAction(() => {
        this.categories.some((cat) => {
          if (cat) {
            cat.amount = body.amount;

            return true;
          }

          return false;
        });

        this.total += delta;
      });
    }
    else {
      throw new Error('invalid response');
    }
  }
}

export default FundingPlanDetails;
