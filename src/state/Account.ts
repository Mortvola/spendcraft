import { makeAutoObservable, runInAction } from 'mobx';
import { AccountProps, isAccountSyncResponse } from '../../common/ResponseTypes';
import { AccountInterface, StoreInterface } from './State';
import { getBody, httpPost } from './Transports';

class Account implements AccountInterface {
  id: number;

  name: string;

  tracking: string;

  syncDate: string;

  balance: number;

  refreshing = false;

  store: StoreInterface;

  constructor(store: StoreInterface, props: AccountProps) {
    this.id = props.id;
    this.name = props.name;
    this.tracking = props.tracking;
    this.syncDate = props.syncDate;
    this.balance = props.balance;

    makeAutoObservable(this);

    this.store = store;
  }

  async refresh(institutionId: number): Promise<void> {
    this.refreshing = true;

    const response = await httpPost(`/institution/${institutionId}/accounts/${this.id}/transactions/sync`);

    const body = await getBody(response);

    runInAction(() => {
      if (response.ok && isAccountSyncResponse(body)) {
        const { categories, accounts } = body;
        if (categories.length > 0) {
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
