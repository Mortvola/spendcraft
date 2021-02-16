import { makeAutoObservable, runInAction } from 'mobx';
import Account from './Account';

class Institution {
  constructor(props) {
    this.id = props.id;
    this.name = props.name;
    this.accounts = props.accounts || [];
    this.unlinkedAccounts = null;

    makeAutoObservable(this);
  }

  async addAccounts(accounts) {
    const response = await fetch(`/institution/${this.id}/accounts`, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accounts, startDate: null }),
    });

    const body = await response.json();

    if (response.ok) {
      runInAction(() => {
        body.accounts.forEach((a) => {
          const account = new Account(a);

          const index = this.accounts.findIndex(
            (acct) => account.name.localeCompare(acct.name) < 0,
          );

          if (index === -1) {
            this.accounts = this.accounts.concat([account]);
          }
          else {
            this.accounts.splice(index, 0, account);
          }
        });
      });
    }

    return null;
  }

  async getUnlinkedAccounts() {
    const response = await fetch(`/institution/${this.id}/accounts`);

    const body = await response.json();

    if (response.ok) {
      runInAction(() => {
        this.unlinkedAccounts = body;
      });
    }
  }
}

export default Institution;
