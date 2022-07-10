import { DateTime } from 'luxon';
import { makeObservable, observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  AccountProps, AccountSyncResponse, AddTransactionResponse, Error,
  isAddTransactionResponse, TrackingType, AccountType,
} from '../../common/ResponseTypes';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  AddTransactionRequest,
} from './State';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';

class Account extends TransactionContainer implements AccountInterface {
  id: number;

  name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  syncDate: DateTime | null;

  plaidBalance: number | null;

  rate: number | null;

  refreshing = false;

  institution: InstitutionInterface;

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    super(store, `/api/account/${props.id}/transactions`);

    this.id = props.id;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.syncDate = props.syncDate !== null ? DateTime.fromISO(props.syncDate) : null;
    this.balance = props.balance;
    this.plaidBalance = props.plaidBalance;
    this.rate = props.rate;
    this.institution = institution;

    makeObservable(this, {
      name: observable,
      syncDate: observable,
      plaidBalance: observable,
      rate: observable,
      institution: observable,
      refreshing: observable,
    });

    this.store = store;
  }

  async setClosed(closed: boolean): Promise<void> {
    const response = await Http.patch(`/api/account/${this.id}`, {
      closed,
    });

    if (response.ok) {
      runInAction(() => {
        this.closed = closed;
        this.institution.closeAccount(this);
      });
    }
  }

  async refresh(institutionId: number): Promise<boolean> {
    runInAction(() => {
      this.refreshing = true;
    });

    const response = await Http.post<void, AccountSyncResponse>(`/api/institution/${institutionId}/accounts/${this.id}/transactions/sync`);

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        const { categories, accounts } = body;
        if (categories.length > 0) {
          this.store.categoryTree.updateBalances(categories);
        }

        if (accounts) {
          this.syncDate = DateTime.fromISO(accounts[0].syncDate);
          this.balance = accounts[0].balance;
          this.plaidBalance = accounts[0].plaidBalance;
        }

        this.refreshing = false;
      });

      return true;
    }

    runInAction(() => {
      this.refreshing = false;
    });

    return false;
  }

  async getPendingTransactions(index = 0): Promise<void> {
    return this.pendingQuery.fetch(
      `/api/account/${this.id}/transactions/pending`,
      index,
      this.pendingResponseHandler,
    );
  }

  async addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null> {
    const response = await Http.post<AddTransactionRequest, AddTransactionResponse>(`/api/account/${this.id}/transactions`, values);

    if (response.ok) {
      const body = await response.body();

      if (isAddTransactionResponse(body)) {
        runInAction(() => {
          this.store.categoryTree.updateBalances(body.categories);

          const transaction = new Transaction(this.store, body.transaction);

          this.insertTransaction(transaction);

          this.balance = body.acctBalances[0].balance;
        });

        return null;
      }
    }

    throw new Error('Error response received');
  }

  delete(): void {
    this.institution.deleteAccount(this);
  }

  async updateOfflineAccount (name: string): Promise<void> {
    const response = await Http.patch(`/api/account/${this.id}`, {
      name,
    });

    if (response.ok) {
      runInAction(() => {
        this.name = name;
      });
    }
  }
}

export default Account;
