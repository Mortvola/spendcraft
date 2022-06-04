import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import Account from './Account';
import {
  UnlinkedAccountProps, InstitutionProps, isUnlinkedAccounts, AccountBalanceProps, Error,
  TrackingType, isAddAccountsResponse, isDeleteAccountResponse, isLinkTokenResponse,
} from '../../common/ResponseTypes';
import { AccountInterface, InstitutionInterface, StoreInterface } from './State';
import Plaid from './Plaid';

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

  async relink(): Promise<void> {
    const response = await Http.get(`/api/institution/${this.id}/link-token`);

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    runInAction(() => {
      if (isLinkTokenResponse(body)) {
        this.store.uiState.plaid = new Plaid(body.linkToken);
      }
    });
  }

  insertAccount(account: Account): void {
    const index = this.accounts.findIndex(
      (acct) => account.name.localeCompare(acct.name) < 0,
    );

    if (index === -1) {
      this.accounts = [
        ...this.accounts.slice(),
        account,
      ];
    }
    else {
      this.accounts = [
        ...this.accounts.slice(0, index),
        account,
        ...this.accounts.slice(index),
      ]
    }
  }

  async addOnlineAccounts(
    accounts: UnlinkedAccountProps[],
    startDate: string,
  ): Promise<null> {
    const response = await Http.post(`/api/institution/${this.id}/accounts`, {
      plaidAccounts: accounts,
      startDate,
    });

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isAddAccountsResponse(body)) {
          body.accounts.forEach((a) => {
            this.insertAccount(new Account(this.store, this, a));
          });
          this.store.categoryTree.updateBalances(body.categories);
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
    rate: number,
  ): Promise<Error[] | null> {
    const response = await Http.post(`/api/institution/${this.id}/accounts`, {
      offlineAccounts: [{
        name: accountName,
        balance,
        type,
        subtype,
        tracking,
        rate,
      }],
      startDate,
    });

    if (response.ok) {
      const body = await response.body();

      if (isAddAccountsResponse(body)) {
        runInAction(() => {
          body.accounts.forEach((acct) => {
            this.insertAccount(new Account(this.store, this, acct));
          })
          this.store.categoryTree.updateBalances(body.categories);
        });
      }
    }

    return null;
  }

  async getUnlinkedAccounts(): Promise<void> {
    const response = await Http.get(`/api/institution/${this.id}/accounts`);

    if (response.ok) {
      const body = await response.body();

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

  removeAccount(account: AccountInterface): void {
    const index = this.accounts.findIndex((a) => a.id === account.id);

    if (index !== -1) {
      this.accounts = [
        ...this.accounts.slice(0, index),
        ...this.accounts.slice(index + 1),
      ];
    }
  }

  async deleteAccount(account: AccountInterface): Promise<void> {
    const response = await Http.delete(`/api/institution/${this.id}/accounts/${account.id}`);

    if (response.ok) {
      const body = await response.body();

      if (isDeleteAccountResponse(body)) {
        runInAction(() => {
          this.removeAccount(account);

          this.store.categoryTree.updateBalances(body);
        });
      }
    }
  }

  closeAccount(account: AccountInterface) {
    runInAction(() => {
      this.accounts = this.accounts.slice();
      this.store.accounts.closeAccount();
    });
  }

  delete(): void {
    this.store.accounts.deleteInstitution(this);
  }

  hasOpenAccounts(): boolean {
    return this.accounts.some((a) => !a.closed);
  }

  hasClosedAccounts(): boolean {
    return this.accounts.some((a) => a.closed);
  }
}

export default Institution;
