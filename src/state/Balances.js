import { makeAutoObservable, runInAction } from 'mobx';

class Balances {
  constructor() {
    this.account = null;
    this.balances = [];

    makeAutoObservable(this);
  }

  async load(account) {
    if (account !== this.account) {
      const response = await fetch(`/account/${account.id}/balances`);

      if (!response.ok) {
        throw new Error('invalid response');
      }

      const body = await response.json();

      if (body) {
        runInAction(() => {
          this.balances = body;
        });
      }
    }
  }
}

export default Balances;
