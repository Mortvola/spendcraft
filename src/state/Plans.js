import { makeAutoObservable, runInAction } from 'mobx';
import FundingPlan from './FundingPlan';
import FundingPlanDetails from './FundingPlanDetails';

class Plans {
  constructor(store) {
    this.list = [];
    this.details = null;

    makeAutoObservable(this);

    this.store = store;
  }

  async load() {
    const response = await fetch('/funding_plans');

    if (response.ok) {
      const body = await response.json();

      runInAction(() => {
        this.list = body.map((p) => (
          new FundingPlan(this.store, p)
        ));
      });
    }
  }

  async loadDetails(fundingPlanId) {
    if (fundingPlanId === null) {
      this.details = null;
    }
    else {
      const response = await fetch(`/funding_plan/${fundingPlanId}/details`);

      if (response.ok) {
        const body = await response.json();

        runInAction(() => {
          this.details = new FundingPlanDetails(this.store, body);
        });
      }
    }
  }

  async addPlan(name) {
    const response = await fetch('/funding_plan', {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (response.ok) {
      const body = await response.json();

      runInAction(() => {
        this.list.push(body);
      });
    }
  }
}

export default Plans;
