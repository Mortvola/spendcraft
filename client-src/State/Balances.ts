import { makeAutoObservable, runInAction } from 'mobx';
import { BalanceProps, isBalancesResponse } from '../../common/ResponseTypes';
import { AccountInterface, BalancesInterface, StoreInterface } from './State';
import Http from '@mortvola/http';

class Balances implements BalancesInterface {
  account: AccountInterface| null = null;

  balances: BalanceProps[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(account: AccountInterface): Promise<void> {
    if (account !== this.account) {
      const response = await Http.get(`/api/account/${account.id}/balances`);

      if (!response.ok) {
        throw new Error('invalid response');
      }

      const body = await response.body();

      if (isBalancesResponse(body)) {
        runInAction(() => {
          this.balances = body;
        });
      }
    }
  }
}

export default Balances;
