import { makeAutoObservable, runInAction } from 'mobx';
import Account from './Account';
import { isBalancesResponse } from '../../common/ResponseTypes';
import { AccountInterface, BalancesInterface, StoreInterface } from './State';
import { getBody } from './Transports';

class Balances implements BalancesInterface {
  account: AccountInterface| null = null;

  balances: Array<unknown> = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(account: Account): Promise<void> {
    if (account !== this.account) {
      const response = await fetch(`/api/account/${account.id}/balances`);

      if (!response.ok) {
        throw new Error('invalid response');
      }

      const body = await getBody(response);

      if (isBalancesResponse(body)) {
        runInAction(() => {
          this.balances = body;
        });
      }
    }
  }
}

export default Balances;
