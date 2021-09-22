import { makeAutoObservable, runInAction } from 'mobx';
import FundingPlan from './FundingPlan';
import FundingPlanDetails from './FundingPlanDetails';
import { FundingPlanInterface, PlansInterface, StoreInterface } from './State';
import { httpGet, httpPost } from './Transports';
import { isFundingPlansResponse, isFundingPlanProps, isFundingPlanDetailsProps } from '../../common/ResponseTypes';

class Plans implements PlansInterface {
  list: FundingPlan[] = [];

  details: FundingPlanDetails | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    const response = await httpGet('/api/funding-plans');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isFundingPlansResponse(body)) {
          this.list = body.map((p) => (
            new FundingPlan(this.store, p)
          ));
        }
      });
    }
  }

  async loadDetails(fundingPlan: FundingPlanInterface): Promise<void> {
    if (fundingPlan === null) {
      this.details = null;
    }
    else {
      const response = await httpGet(`/api/funding-plans/${fundingPlan.id}/details`);

      if (response.ok) {
        const body = await response.body();

        if (isFundingPlanDetailsProps(body)) {
          runInAction(() => {
            this.details = new FundingPlanDetails(this.store, body);
          });
        }
      }
    }
  }

  async addPlan(name: string): Promise<{ message: string }[] | null> {
    const response = await httpPost('/api/funding-plans', { name });

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
