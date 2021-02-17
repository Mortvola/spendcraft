import { makeAutoObservable, runInAction } from 'mobx';

class Account {
  constructor(store, props) {
    this.store = store;
    this.id = props.id || null;
    this.name = props.name || null;
    this.tracking = props.tracking || null;
    this.syncDate = props.syncDate || null;
    this.refreshing = false;

    makeAutoObservable(this);
  }

  async refresh(institutionId) {
    this.refreshing = true;

    const response = await fetch(`/institution/${institutionId}/accounts/${this.id}/transactions/sync`, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      },
    });

    const body = await response.json();

    runInAction(() => {
      if (response.ok) {
        const { categories, accounts } = body;
        if (categories && categories.length > 0) {
          this.store.categoryTree.updateBalances(categories);
        }

        if (accounts) {
          this.syncDate = accounts[0].syncDate;
          this.balance = accounts[0].balance;
        }
      }

      this.refreshing = false;
    });
  }
}

export default Account;
