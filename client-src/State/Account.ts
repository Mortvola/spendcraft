import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import {
  AccountProps, Error, isAccountSyncResponse, isAccountTransactionsResponse, isAddTransactionResponse, TrackingType,
} from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
} from './State';
import Transaction from './Transaction';
import {
  getBody, httpGet, httpPatch, httpPost,
} from './Transports';

class Account implements AccountInterface {
  id: number;

  name: string;

  officialName: string | null = null;

  type: string;

  subtype: string;

  tracking: TrackingType;

  syncDate: DateTime | null;

  balance: number;

  plaidBalance: number | null;

  rate: number | null;

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  fetching = false;

  refreshing = false;

  institution: InstitutionInterface;

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.syncDate = props.syncDate !== null ? DateTime.fromISO(props.syncDate) : null;
    this.balance = props.balance;
    this.plaidBalance = props.plaidBalance;
    this.rate = props.rate;
    this.institution = institution;

    makeAutoObservable(this);

    this.store = store;
  }

  async refresh(institutionId: number): Promise<void> {
    this.refreshing = true;

    const response = await httpPost(`/api/institution/${institutionId}/accounts/${this.id}/transactions/sync`);

    const body = await getBody(response);

    runInAction(() => {
      if (response.ok && isAccountSyncResponse(body)) {
        const { categories, accounts } = body;
        if (categories.length > 0) {
          this.store.categoryTree.updateBalances(categories);
        }

        if (accounts) {
          this.syncDate = DateTime.fromISO(accounts[0].syncDate);
          this.balance = accounts[0].balance;
          this.plaidBalance = accounts[0].plaidBalance;
        }
      }

      this.refreshing = false;
    });
  }

  static sort(t: Transaction[] | PendingTransaction[]): void {
    t.sort((a, b) => {
      if (a.date < b.date) {
        return 1;
      }

      if (a.date > b.date) {
        return -1;
      }

      // if (a.sortOrder < b.sortOrder) {
      //   return 1;
      // }

      // if (a.sortOrder > b.sortOrder) {
      //   return -1;
      // }

      return 0;
    });
  }

  async getTransactions(): Promise<void> {
    this.fetching = true;
    const response = await httpGet(`/api/account/${this.id}/transactions`);

    const body = await getBody(response);

    if (response.ok && isAccountTransactionsResponse(body)) {
      runInAction(() => {
        if (body !== null) {
          this.balance = body.balance;
          this.pending = body.pending.map((pt) => new PendingTransaction(pt));
          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
          ));
          Account.sort(this.transactions);
          Account.sort(this.pending);
        }
        else {
          this.transactions = [];
        }

        this.fetching = false;
      });
    }
    else {
      this.fetching = false;
    }
  }

  async addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null> {
    const response = await httpPost(`/api/account/${this.id}/transactions`, values);

    if (response.ok) {
      const body = await getBody(response);

      if (isAddTransactionResponse(body)) {
        runInAction(() => {
          this.store.categoryTree.updateBalances(body.categories);

          const transaction = new Transaction(this.store, body.transaction);

          this.insertTransaction(transaction);

          this.balance = body.balance;
        });

        return null;
      }
    }

    throw new Error('Error response received');
  }

  insertTransaction(transaction: Transaction): void {
    const index = this.transactions.findIndex((t) => transaction.date >= t.date);

    if (index === -1) {
      this.transactions.push(transaction);
    }
    else {
      this.transactions.splice(index, 0, transaction)
    }
  }

  removeTransaction(transactionId: number): void {
    const index = this.transactions.findIndex((t) => t.id === transactionId);

    if (index !== -1) {
      this.transactions.splice(index, 1);
    }
  }

  delete(): void {
    this.institution.deleteAccount(this);
  }

  async updateOfflineAccount (name: string): Promise<void> {
    const response = await httpPatch(`/api/account/${this.id}`, {
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
