import { makeAutoObservable, runInAction } from 'mobx';
import FundingPlanGroup from './FundingPlanGroup';
import { StoreInterface } from './State';
import { getBody, httpPut } from './Transports';
import {
  FundingPlanDetailsProps,
  isUpdateFundingCategoryResponse,
} from '../../common/ResponseTypes';
import HistoryGroup from './HistoryGroup';

class FundingPlanDetails {
  id: number;

  history: HistoryGroup[];

  total: number;

  groups: FundingPlanGroup[];

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanDetailsProps) {
    this.id = props.id;
    this.history = props.history;
    this.total = props.total;

    this.groups = props.groups.map((g) => (
      new FundingPlanGroup(store, g)
    ));

    makeAutoObservable(this);

    this.store = store;
  }

  async updateCategoryAmount(categoryId: number, amount: number, delta: number): Promise<void> {
    const response = await httpPut(`/api/funding-plans/${this.id}/item/${categoryId}`, { amount });

    const body = await getBody(response);

    if (response.ok && isUpdateFundingCategoryResponse(body)) {
      runInAction(() => {
        this.groups.some((g) => {
          const cat = g.categories.find((c) => c.id === categoryId);

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
