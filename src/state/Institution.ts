import { makeAutoObservable, runInAction } from 'mobx';
import Account from './Account';
import { InstitutionProps, isAccountsResponse } from './ResponseTypes';
import { StoreInterface } from './State';
import { getBody, postJSON } from './Transports';

class Institution {
  id: number;

  name: string;

  unlinkedAccounts: unknown | null = null;

  accounts: Array<Account>;

  store: StoreInterface;

  constructor(store: StoreInterface, props: InstitutionProps) {
    this.id = props.id;
    this.name = props.name;

    this.accounts = [];
    if (props.accounts) {
      this.accounts = props.accounts.map((acct) => new Account(store, acct));
    }

    makeAutoObservable(this);

    this.store = store;
  }

  async addAccounts(accounts: Array<Account>): Promise<null> {
    const response = await postJSON(`/institution/${this.id}/accounts`, { accounts, startDate: null });

    const body = await getBody(response);

    if (response.ok) {
      runInAction(() => {
        if (isAccountsResponse(body)) {
          body.forEach((a) => {
            const account = new Account(this.store, a);

            const index = this.accounts.findIndex(
              (acct) => account.name.localeCompare(acct.name) < 0,
            );

            if (index === -1) {
              this.accounts.push(account);
            }
            else {
              this.accounts.splice(index, 0, account);
            }
          });
        }
      });
    }

    return null;
  }

  async getUnlinkedAccounts(): Promise<void> {
    const response = await fetch(`/institution/${this.id}/accounts`);

    const body = await getBody(response);

    if (response.ok) {
      runInAction(() => {
        this.unlinkedAccounts = body;
      });
    }
  }
}

export default Institution;
