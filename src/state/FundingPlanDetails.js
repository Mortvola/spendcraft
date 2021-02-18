import { makeAutoObservable, runInAction } from 'mobx';
import FundingPlanGroup from './FundingPlanGroup';

class FundingPlanDetails {
  constructor(store, props) {
    this.planId = props.id;
    this.history = props.history;
    this.total = props.total;

    this.groups = props.groups.map((g) => (
      new FundingPlanGroup(store, g)
    ));

    makeAutoObservable(this);

    this.store = store;
  }

  async updateCategoryAmount(categoryId, amount, delta) {
    const response = await fetch(`/funding_plan/${this.planId}/item/${categoryId}`, {
      method: 'PUT',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });

    if (response.ok) {
      const body = await response.json();

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
  }
}

export default FundingPlanDetails;
