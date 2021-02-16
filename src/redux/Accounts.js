import { makeAutoObservable, runInAction } from 'mobx';
import Institution from './Institution';
import Plaid from './Plaid';

class Accounts {
  constructor() {
    this.institutions = [];
    this.selectedAccount = null;
    this.plaid = new Plaid();

    makeAutoObservable(this);
  }

  selectAccount(account) {
    this.selectedAccount = account;
  }

  async load() {
    const response = await fetch('/connected_accounts');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.json();

    if (body) {
      runInAction(() => {
        body.forEach((i) => {
          const institution = new Institution(i);
          this.institutions.push(institution);
        });
      });
    }
  }

  async relinkInstitution(institutionId) {
    const response = await fetch(`/institution/${institutionId}/link_token`);

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.json();

    this.plaid.showDialog(body.linkToken, true);
  }

  async addInstitution(publicToken, metadata) {
    const response = await fetch('/institution', {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicToken,
        institution: metadata.institution,
      }),
    });

    const body = await response.json();
    const institution = new Institution({ id: body.id, name: body.name, accounts: [] });

    runInAction(() => {
      const index = this.institutions.findIndex(
        (inst) => institution.name.localeCompare(inst.name) < 0,
      );

      if (index === -1) {
        this.institutions.concat([institution]);
      }
      else {
        this.institutions.splice(index, 0, institution);
      }
    });

    // openAccountSelectionDialog(json.id, json.accounts);
  }
}

export default Accounts;
