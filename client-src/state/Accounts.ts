import { makeAutoObservable, runInAction } from 'mobx';
import Institution from './Institution';
import Plaid from './Plaid';
import { isInstitutionProps, isInstitutionsResponse, isLinkTokenResponse } from '../../common/ResponseTypes';
import { AccountInterface, AccountsInterface, StoreInterface } from './State';
import { getBody, postJSON } from './Transports';

class Accounts implements AccountsInterface {
  institutions: Array<Institution> = [];

  selectedAccount: AccountInterface | null = null;

  plaid: unknown | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  selectAccount(account: AccountInterface): void {
    this.selectedAccount = account;
  }

  async load(): Promise<void> {
    const response = await fetch('/connected_accounts');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await getBody(response);

    if (body) {
      if (isInstitutionsResponse(body)) {
        runInAction(() => {
          body.forEach((i) => {
            this.institutions.push(new Institution(this.store, i));
          });
        });
      }
    }
  }

  async relinkInstitution(institutionId: number): Promise<void> {
    const response = await fetch(`/institution/${institutionId}/link_token`);

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await getBody(response);

    runInAction(() => {
      if (isLinkTokenResponse(body)) {
        this.plaid = new Plaid(body.linkToken);
      }
    });
  }

  async addInstitution(): Promise<void> {
    const response = await fetch('/user/link_token');

    if (response.ok) {
      const body = await getBody(response);

      runInAction(() => {
        if (isLinkTokenResponse(body)) {
          this.plaid = new Plaid(
            body.linkToken,
            async (publicToken, metadata) => {
              const response2 = await postJSON('/institution', {
                publicToken,
                institution: metadata.institution,
              });

              const body2 = await getBody(response2);
              if (response2.ok && isInstitutionProps(body2)) {
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
            },
          );
        }
      });
    }
  }
}

export default Accounts;
