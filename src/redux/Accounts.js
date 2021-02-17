import { makeAutoObservable, runInAction } from 'mobx';
import Institution from './Institution';
import Plaid from './Plaid';

class Accounts {
  constructor(store) {
    this.institutions = [];
    this.selectedAccount = null;
    this.plaid = null;

    makeAutoObservable(this);

    this.store = store;
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
          const institution = new Institution(this.store, i);
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

    runInAction(() => {
      this.plaid = new Plaid(body.linkToken);
    });
  }

  async addInstitution() {
    const response = await fetch('/user/link_token');

    if (response.ok) {
      const body = await response.json();

      runInAction(() => {
        this.plaid = new Plaid(body.linkToken, async (publicToken, metadata) => {
          const response2 = await fetch('/institution', {
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

          const body2 = await response2.json();
          if (response2.ok) {
            let institution = new Institution(
              this.store, { id: body2.id, name: body2.name, accounts: [] },
            );

            runInAction(() => {
              // Make sure we don't already have the institution in the list.
              const existingIndex = this.institutions.findIndex(
                (inst) => inst.id === institution.id,
              );

              if (existingIndex === -1) {
                const index = this.institutions.findIndex(
                  (inst) => institution.name.localeCompare(inst.name) < 0,
                );

                if (index === -1) {
                  this.institutions.push(institution);
                }
                else {
                  this.institutions.splice(index, 0, institution);
                }
              }
              else {
                institution = this.institutions[existingIndex];
              }
            });

            return institution;
          }

          return null;
        });
      });
    }
  }
}

export default Accounts;
