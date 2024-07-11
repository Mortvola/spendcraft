import { makeObservable, observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  AccountProps, AddTransactionResponse, Error,
  isAddTransactionResponse, TrackingType, AccountType,
} from '../../common/ResponseTypes';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  AddTransactionRequest,
  AccountSettings,
} from './Types';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';

class Account implements AccountInterface {
  id: number;

  plaidId: string | null;

  name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  plaidBalance: number | null;

  startDate: DateTime | null;

  rate: number | null;

  institution: InstitutionInterface;

  balance = 0;

  transactions: TransactionContainer;

  pendingTransactions: TransactionContainer;

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    this.transactions = new TransactionContainer(
      store,
      // `/api/v1/account/${props.id}/transactions`,
      `local:accountId:${props.id}`,
      this.updateBalance,
    );

    this.pendingTransactions = new TransactionContainer(
      store, `/api/v1/account/${props.id}/transactions?pending=1`,
    );

    this.id = props.id;
    this.plaidId = props.plaidId;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.balance = props.balance;
    this.plaidBalance = props.plaidBalance;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;
    this.institution = institution;

    makeObservable(this, {
      name: observable,
      plaidBalance: observable,
      rate: observable,
      institution: observable,
      balance: observable,
    });

    this.store = store;
  }

  update(props: AccountProps): void {
    this.id = props.id;
    this.plaidId = props.plaidId;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.balance = props.balance;
    this.plaidBalance = props.plaidBalance;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;

    // this.transactions.url = `/api/v1/account/${props.id}/transactions`;
    // this.pendingTransactions.url = `/api/v1/account/${props.id}/transactions?pending=1`;
  }

  updateBalance(balance: number) {
    this.balance = balance;
  }

  async setSettings(settings: AccountSettings): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, settings);

    if (response.ok) {
      runInAction(() => {
        this.closed = settings.closed ?? this.closed;

        if (this.closed) {
          this.institution.closeAccount(this);
        }
      });
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
    const response = await Http.post<AddTransactionRequest, AddTransactionResponse>(`/api/v1/account/${this.id}/transactions`, values);

    if (response.ok) {
      const body = await response.body();

      if (isAddTransactionResponse(body)) {
        runInAction(() => {
          this.store.categoryTree.updateBalances(body.categories);

          const transaction = new Transaction(this.store, body.transaction);

          this.transactions.insertTransaction(transaction);

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
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
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
