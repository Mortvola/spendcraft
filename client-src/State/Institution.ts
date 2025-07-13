import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import Account from './Account';
import {
  UnlinkedAccountProps, InstitutionProps, AccountBalanceProps, ErrorProps,
  TrackingType, isAddOnlineAccountsResponse, isDeleteAccountResponse, isLinkTokenResponse,
  InstitutionSyncResponse, AddInstitutionResponse,
  AddOfflineAccountResponse,
  ApiResponse,
} from '../../common/ResponseTypes';
import { AccountInterface, InstitutionInterface, StoreInterface } from './Types';
import Plaid from './Plaid';

class Institution implements InstitutionInterface {
  @observable
  accessor id: number;

  @observable
  accessor plaidInstitutionId: string | null;

  @observable
  accessor name: string;

  @observable
  accessor unlinkedAccounts: UnlinkedAccountProps[] | null = null;

  @observable
  accessor accounts: AccountInterface[];

  store: StoreInterface;

  @observable
  accessor refreshing = false;

  @observable
  accessor syncDate: DateTime | null;

  constructor(store: StoreInterface, props: InstitutionProps) {
    this.id = props.id;
    this.plaidInstitutionId = props.plaidInstitutionId;
    this.name = props.name;
    this.syncDate = props.syncDate !== null ? DateTime.fromISO(props.syncDate) : null;

    this.accounts = props.accounts.map((acct) => new Account(store, this, acct));

    this.store = store;
  }

  refresh(props: InstitutionProps) {
    this.id = props.id;
    this.plaidInstitutionId = props.plaidInstitutionId;
    this.name = props.name;
    this.syncDate = props.syncDate !== null ? DateTime.fromISO(props.syncDate) : null;

    props.accounts.forEach((acctProps) => {
      const acct = this.accounts.find((a) => a.id === acctProps.id);

      if (acct) {
        // Found account...
        acct.update(acctProps);
      }
      else {
        // Account was not found
        const newAccount = new Account(this.store, this, acctProps);

        this.insertAccount(newAccount);
      }
    });
  }

  async relink(): Promise<void> {
    const response = await Http.get(`/api/v1/institution/${this.id}/link-token`);

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    runInAction(() => {
      if (isLinkTokenResponse(body)) {
        this.store.uiState.plaid = new Plaid(body.linkToken, this);
      }
    });
  }

  async sync(institutionId: number): Promise<boolean> {
    runInAction(() => {
      this.refreshing = true;
    });

    const response = await Http.post<undefined, InstitutionSyncResponse>(`/api/v1/institution/${institutionId}/accounts/${this.id}/transactions/sync`);

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        const { categories, syncDate } = body;
        if (categories && categories.length > 0) {
          this.store.categoryTree.updateBalances(categories);
        }

        this.syncDate = DateTime.fromISO(syncDate);

        this.refreshing = false;
      });

      return true;
    }

    runInAction(() => {
      this.refreshing = false;
    });

    return false;
  }

  async update(): Promise<Institution | null> {
    const response = await Http.post<null, AddInstitutionResponse>(`/api/v1/institution/${this.id}`);

    if (response.ok) {
      const body = await response.body();
      // let institution = new Institution(
      //   this.store,
      //   {
      //     id: body.id,
      //     name: body.name,
      //     offline: body.offline,
      //     syncDate: body.syncDate,
      //     accounts: body.accounts,
      //   },
      // );

      runInAction(() => {
        body.accounts.forEach((accountResponse) => {
          const account = this.accounts.find((a) => a.id === accountResponse.id);

          if (!account) {
            // Account was not found. Add it...
            const newAccount = new Account(this.store, this, accountResponse);

            this.insertAccount(newAccount);
          }
        })
        // Make sure we don't already have the institution in the list.
        // const existingIndex = this.findIndex(
        //   (inst) => inst.id === institution.id,
        // );

        // if (existingIndex === -1) {
        //   this.insertInstitution(institution);
        // }
        // else {
        //   institution = this.institutions[existingIndex];
        // }
      });

      return this;
    }

    return null;
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
    const response = await Http.post(`/api/v1/institution/${this.id}/accounts`, {
      plaidAccounts: accounts,
      startDate,
    });

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isAddOnlineAccountsResponse(body)) {
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
  ): Promise<ErrorProps[] | null> {
    const response = await Http.post<unknown, ApiResponse<AddOfflineAccountResponse>>(`/api/v1/institution/${this.id}/accounts`, {
      name: accountName,
      balance,
      type,
      subtype,
      tracking,
      rate,
      startDate,
    });

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (body.data) {
          this.insertAccount(new Account(this.store, this, body.data.account));
          this.store.categoryTree.updateBalances(body.data.categories);
        }
      });
    }

    return null;
  }

  // async getUnlinkedAccounts(): Promise<void> {
  //   const response = await Http.get(`/api/v1/institution/${this.id}/accounts`);

  //   if (response.ok) {
  //     const body = await response.body();

  //     if (isUnlinkedAccounts(body)) {
  //       runInAction(() => {
  //         this.unlinkedAccounts = body;
  //       });
  //     }
  //   }
  // }

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
    const response = await Http.delete(`/api/v1/institution/${this.id}/accounts/${account.id}`);

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

  closeAccount(_account: AccountInterface) {
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
