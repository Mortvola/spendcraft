import { makeAutoObservable, runInAction } from 'mobx';

class Accounts {
  constructor() {
    this.institutions = [];
    this.selectedAccount = null;

    makeAutoObservable(this);
  }

  selectAccount(account) {
    this.selectedAccount = account;
  }

  async load() {
    const response = await fetch('/connected_accounts');

    const body = await response.json();

    if (body) {
      runInAction(() => {
        this.institutions = body;
      });
    }
  }

  static async relinkInstitution(institutionId) {
    const response = await fetch(`/institution/${institutionId}/link_token`);

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.json();

    // dispatch({
    //   type: SHOW_PLAID_LINK,
    //   linkToken: body.linkToken,
    //   updateMode: true,
    // });
  }
}

export default Accounts;
