import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import {
  AccountProps, Error, isAccountSyncResponse,
  isAddTransactionResponse, isPendingTransactionsResponse, isTransactionsResponse, TrackingType,
} from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import QueryManager from './QueryManager';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
} from './State';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';
import {
  getBody, httpPatch, httpPost,
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

  transactions: TransactionContainer<Transaction>;

  transactionsQuery: QueryManager = new QueryManager();

  pending: TransactionContainer<PendingTransaction>;

  pendingQuery: QueryManager = new QueryManager();

  refreshing = false;

  institution: InstitutionInterface;

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    this.transactions = new TransactionContainer(Transaction, store);
    this.pending = new TransactionContainer(PendingTransaction, store);

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

  async getTransactions(index = 0): Promise<void> {
    return this.transactionsQuery.fetch(
      `/api/account/${this.id}/transactions`,
      index,
      (body: unknown, idx: number, limit: number): boolean => {
        if (isTransactionsResponse(body)) {
          this.balance = body.balance;

          if (idx === 0) {
            this.transactions.setTransactions(body.transactions);
          }
          else {
            this.transactions.appendTransactions(body.transactions);
          }

          return body.transactions.length < limit;
        }

        this.transactions.clear();

        return false;
      },
    );
  }

  getMoreTransactions(): Promise<void> {
    return this.getTransactions(this.transactions.transactions.length);
  }

  async getPendingTransactions(index = 0): Promise<void> {
    return this.pendingQuery.fetch(
      `/api/account/${this.id}/transactions/pending`,
      index,
      (body: unknown, idx: number, limit: number) => {
        if (isPendingTransactionsResponse(body)) {
          if (idx === 0) {
            this.pending.setTransactions(body);
          }
          else {
            this.pending.appendTransactions(body);
          }

          return body.length < limit;
        }

        this.pending.clear();

        return false;
      },
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
    this.transactions.insertTransaction(transaction);
  }

  removeTransaction(transactionId: number): void {
    this.transactions.removeTransaction(transactionId);
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
