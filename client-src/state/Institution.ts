import { makeAutoObservable, runInAction } from 'mobx';
import Account from './Account';
import {
  UnlinkedAccountProps, InstitutionProps, isAccountsResponse, isUnlinkedAccounts, AccountBalanceProps, Error,
  TrackingType, isAddAccountsResponse,
} from '../../common/ResponseTypes';
import { AccountInterface, InstitutionInterface, StoreInterface } from './State';
import {
  getBody, httpDelete, httpGet, httpPost,
} from './Transports';

class Institution implements InstitutionInterface {
  id: number;

  name: string;

  offline: boolean;

  unlinkedAccounts: UnlinkedAccountProps[] | null = null;

  accounts: AccountInterface[];

  store: StoreInterface;

  constructor(store: StoreInterface, props: InstitutionProps) {
    this.id = props.id;
    this.name = props.name;
    this.offline = props.offline;

    this.accounts = [];
    if (props.accounts) {
      this.accounts = props.accounts.map((acct) => new Account(store, this, acct));
    }

    makeAutoObservable(this);

    this.store = store;
  }

  insertAccount(account: Account): void {
    const index = this.accounts.findIndex(
      (acct) => account.name.localeCompare(acct.name) < 0,
    );

    if (index === -1) {
      this.accounts.push(account);
    }
    else {
      this.accounts.splice(index, 0, account);
    }
  }

  async addAccounts(
    accounts: UnlinkedAccountProps[],
    startDate: string,
  ): Promise<null> {
    const response = await httpPost(`/api/institution/${this.id}/accounts`, {
      plaidAccounts: accounts,
      startDate,
    });

    if (response.ok) {
      const body = await getBody(response);

      runInAction(() => {
        if (isAddAccountsResponse(body)) {
          body.accounts.forEach((a) => {
            this.insertAccount(new Account(this.store, this, a));
          });
        }
      });
    }

    return null;
  }

  async addOfflineAccount(
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
  ): Promise<Error[] | null> {
    const response = await httpPost(`/api/institution/${this.id}/accounts`, {
      offlineAccounts: [{
        name: accountName,
        balance,
        type,
        subtype,
        tracking,
      }],
      startDate,
    });

    if (response.ok) {
      const body = await getBody(response);

      if (isAccountsResponse(body)) {
        runInAction(() => {
          body.forEach((acct) => {
            this.insertAccount(new Account(this.store, this, acct));
          })
        });
      }
    }

    return null;
  }

  async getUnlinkedAccounts(): Promise<void> {
    const response = await httpGet(`/api/institution/${this.id}/accounts`);

    if (response.ok) {
      const body = await getBody(response);

      if (isUnlinkedAccounts(body)) {
        runInAction(() => {
          this.unlinkedAccounts = body;
        });
      }
    }
  }

  updateBalances(balances: AccountBalanceProps[]): void {
    this.accounts.forEach((a) => {
      const balance = balances.find((b) => b.id === a.id);
      if (balance) {
        a.balance = balance.balance;
      }
    });
  }

  async deleteAccount(account: AccountInterface): Promise<void> {
    const response = await httpDelete(`/api/institution/${this.id}/accounts/${account.id}`);

    if (response.ok) {
      runInAction(() => {
        const index = this.accounts.findIndex((a) => a.id === account.id);

        if (index !== -1) {
          this.accounts.splice(index, 1);
        }
      });
    }
  }

  delete(): void {
    this.store.accounts.deleteInstitution(this);
  }
}

export default Institution;
