import { makeAutoObservable, runInAction } from 'mobx';
import { AccountProps, AddTransactionProps, Error, isAccountSyncResponse, isAccountTransactionsResponse, isAddTransactionResponse } from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import { AccountInterface, StoreInterface } from './State';
import Transaction from './Transaction';
import { getBody, httpPost, postJSON } from './Transports';

class Account implements AccountInterface {
  id: number;

  name: string;

  official_name: string | null = null;

  subtype: string | null = null;

  tracking: 'Balances' | 'Transactions';

  syncDate: string;

  balance: number;

  balances: {
    current: number | null,
  } = { current: null };

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  fetching = false;

  refreshing = false;

  store: StoreInterface;

  constructor(store: StoreInterface, props: AccountProps) {
    this.id = props.id;
    this.name = props.name;
    this.tracking = props.tracking;
    this.syncDate = props.syncDate;
    this.balance = props.balance;

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
          this.syncDate = accounts[0].syncDate;
          this.balance = accounts[0].balance;
        }
      }

      this.refreshing = false;
    });
  }

  async getTransactions(): Promise<void> {
    this.fetching = true;
    const response = await fetch(`/api/account/${this.id}/transactions`);

    const body = await getBody(response);

    if (response.ok && isAccountTransactionsResponse(body)) {
      body.transactions.sort((a, b) => {
        if (a.date < b.date) {
          return 1;
        }

        if (a.date > b.date) {
          return -1;
        }

        if (a.sortOrder < b.sortOrder) {
          return 1;
        }

        if (a.sortOrder > b.sortOrder) {
          return -1;
        }

        return 0;
      });

      runInAction(() => {
        if (body !== null) {
          this.balance = body.balance;
          this.pending = body.pending.map((pt) => new PendingTransaction(pt));
          this.transactions = body.transactions.map((t) => (
            new Transaction(this.store, t)
          ));
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

  async addTransaction(transaction: AddTransactionProps): Promise<Error[] | null> {
    const response = await postJSON(`/api/account/${this.id}/transactions`, transaction);

    if (response.ok) {
      const body = await getBody(response);

      if (isAddTransactionResponse(body)) {
        if (body.categories.length > 0) {
          runInAction(() => {
            this.store.categoryTree.updateBalances(body.categories);

            const transaction = new Transaction(this.store, body.transaction);

            const index = this.transactions.findIndex((t) => body.transaction.date >= t.date);

            if (index === -1) {
              this.transactions.push(transaction);
            }
            else {
              this.transactions.splice(index, 0, transaction)
            }

            this.balance = body.balance;
          });

          return null;
        }
      }
    }

    throw new Error('Error response received');
  }
}

export default Account;
