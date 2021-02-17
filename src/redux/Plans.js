import { makeAutoObservable, runInAction } from 'mobx';

class Plans {
  constructor(store) {
    this.list = [];

    makeAutoObservable(this);

    this.store = store;
  }

  async load() {
    const response = await fetch('/funding_plans');

    if (response.ok) {
      const body = await response.json();

      runInAction(() => {
        this.list = body;
      });
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
