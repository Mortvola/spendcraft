import { makeAutoObservable, runInAction } from 'mobx';
import Institution from './Institution';
import Plaid, { PlaidMetaData } from './Plaid';
import {
  AccountBalanceProps, Error, isAddInstitutionResponse, isDeleteInstitutionResponse, isInstitutionProps,
  isInstitutionsResponse, isLinkTokenResponse, TrackingType,
} from '../../common/ResponseTypes';
import {
  AccountInterface, AccountsInterface, InstitutionInterface, StoreInterface,
} from './State';
import {
  httpDelete, httpGet, httpPost,
} from './Transports';

class Accounts implements AccountsInterface {
  institutions: Institution[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  selectAccount(account: AccountInterface): void {
    this.store.uiState.selectAccount(account);
  }

  async load(): Promise<void> {
    const response = await httpGet('/api/connected-accounts');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      if (isInstitutionsResponse(body)) {
        runInAction(() => {
          body.forEach((i) => {
            const institution = new Institution(this.store, i);
            this.insertInstitution(institution);
          });
        });
      }
    }
  }

  insertInstitution(institution: Institution): void {
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

  async linkInstitution(): Promise<void> {
    const response = await httpGet('/api/user/link-token');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isLinkTokenResponse(body)) {
          this.store.uiState.plaid = new Plaid(
            body.linkToken,
            async (publicToken, metadata: PlaidMetaData): Promise<Institution | null> => {
              const i = metadata.institution;

              return this.addInstitution(publicToken, i.name, i.institution_id);
            },
          );
        }
      });
    }
  }

  async addInstitution(
    publicToken: string,
    name: string,
    plaidInstitutionId: string,
  ): Promise<Institution | null> {
    const response = await httpPost('/api/institution', {
      publicToken,
      institution: {
        name,
        institutionId: plaidInstitutionId,
      },
    });

    const body2 = await response.body();
    if (response.ok && isInstitutionProps(body2)) {
      let institution = new Institution(
        this.store, {
          id: body2.id,
          name: body2.name,
          offline: false,
          accounts: [],
        },
      );

      runInAction(() => {
        // Make sure we don't already have the institution in the list.
        const existingIndex = this.institutions.findIndex(
          (inst) => inst.id === institution.id,
        );

        if (existingIndex === -1) {
          this.insertInstitution(institution);
        }
        else {
          institution = this.institutions[existingIndex];
        }
      });

      return institution;
    }

    return null;
  }

  async addOfflineAccount(
    instituteName: string,
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null> {
    const response = await httpPost('/api/institution', {
      institution: {
        name: instituteName,
      },
      accounts: [{
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

      if (isAddInstitutionResponse(body)) {
        runInAction(() => {
          const institution = new Institution(this.store, {
            id: body.id,
            name: body.name,
            offline: body.offline,
            accounts: body.accounts,
          });

          // Make sure we don't already have the institution in the list.
          const existingIndex = this.institutions.findIndex(
            (inst) => inst.id === institution.id,
          );

          if (existingIndex === -1) {
            this.insertInstitution(institution);
          }

          this.store.categoryTree.updateBalances(body.categories);
        });
      }
    }

    return null;
  }

  updateBalances(balances: AccountBalanceProps[]): void {
    runInAction(() => {
      this.institutions.forEach((i) => {
        i.updateBalances(balances);
      });
    });
  }

  async deleteInstitution(institution: InstitutionInterface): Promise<void> {
    const response = await httpDelete(`/api/institution/${institution.id}`);

    if (response.ok) {
      const body = await response.body();

      if (isDeleteInstitutionResponse(body)) {
        runInAction(() => {
          const index = this.institutions.findIndex((i) => i.id === institution.id);

          if (index !== -1) {
            this.institutions.splice(index, 1);
          }

          this.store.categoryTree.updateBalances(body);
        });
      }
    }
  }
}

export default Accounts;
