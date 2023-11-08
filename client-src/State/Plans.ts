import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import FundingPlan from './FundingPlan';
import FundingPlanDetails from './FundingPlanDetails';
import { FundingPlanInterface, PlansInterface, StoreInterface } from './State';
import {
  FundingPlanDetailsProps,
} from '../../common/ResponseTypes';

class Plans implements PlansInterface {
  list: FundingPlan[] = [];

  details: FundingPlanDetails | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    if (!this.store.uiState.selectedPlan) {
      this.list = [new FundingPlan(this.store, { id: 0, name: 'test' })];
      [this.store.uiState.selectedPlan] = this.list;
    }
  }

  async loadDetails(fundingPlan: FundingPlanInterface): Promise<void> {
    if (fundingPlan === null) {
      this.details = null;
    }
    else {
      const response = await Http.get<FundingPlanDetailsProps>('/api/v1/funding-plans?h=12');

      if (response.ok) {
        const body = await response.body();

        runInAction(() => {
          this.details = new FundingPlanDetails(this.store, body);
        });
      }
    }
  }
}

export default Plans;
