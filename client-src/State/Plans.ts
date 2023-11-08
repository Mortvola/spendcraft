import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import FundingPlan from './FundingPlan';
import FundingPlanDetails from './FundingPlanDetails';
import { FundingPlanInterface, PlansInterface, StoreInterface } from './State';
import {
  isFundingPlansResponse, isFundingPlanProps,
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
    const response = await Http.get('/api/v1/funding-plans');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isFundingPlansResponse(body)) {
          this.list = body.map((p) => (
            new FundingPlan(this.store, p)
          ));
          [this.store.uiState.selectedPlan] = this.list;
        }
      });
    }
  }

  async loadDetails(fundingPlan: FundingPlanInterface): Promise<void> {
    if (fundingPlan === null) {
      this.details = null;
    }
    else {
      const response = await Http.get<FundingPlanDetailsProps>(`/api/v1/funding-plans/${fundingPlan.id}?h=12`);

      if (response.ok) {
        const body = await response.body();

        runInAction(() => {
          this.details = new FundingPlanDetails(this.store, body);
        });
      }
    }
  }

  async addPlan(name: string): Promise<{ message: string }[] | null> {
    const response = await Http.post('/api/v1/funding-plans', { name });

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isFundingPlanProps(body)) {
          this.list.push(new FundingPlan(this.store, body));
        }
      });
    }

    return null;
  }

  async deletePlan(id: number): Promise<{ message: string }[] | null> {
    const index = this.list.findIndex((p) => p.id === id);

    if (index !== -1) {
      this.list.splice(index, 1);
    }

    return null;
  }
}

export default Plans;
