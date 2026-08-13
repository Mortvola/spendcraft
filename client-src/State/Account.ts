import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  AccountProps, AddTransactionResponse, ErrorProps,
  isAddTransactionResponse, TrackingType, AccountType,
  isErrorResponse,
} from '../../common/ResponseTypes';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  AddTransactionRequest,
  AccountSettings,
} from './Types';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';
import Statements from './Statements';

class Account implements AccountInterface {
  id: number;

  plaidId: string | null;

  @observable
  accessor name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  @observable
  accessor plaidBalance: number | null;

  startDate: DateTime | null;

  @observable
  accessor rate: number | null;

  @observable
  accessor institution: InstitutionInterface;

  @observable
  accessor balance = 0;

  @observable
  accessor pendingBalance = 0;

  transactions: TransactionContainer;

  pendingTransactions: TransactionContainer;

  @observable
  accessor statements: Statements;

  get sign(): number {
    return this.type === AccountType.Credit ? -1 : 1
  }

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    this.transactions = new TransactionContainer(
      store,
      `/api/v1/account/${props.id}/transactions`,
      (balance: number) => {
        this.balance = balance;
      },
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
    this.pendingBalance = props.pendingBalance;
    this.plaidBalance = props.plaidBalance;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;
    this.institution = institution;

    this.statements = new Statements(this, store)

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
    this.pendingBalance = props.pendingBalance;
    this.plaidBalance = props.plaidBalance;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;

    this.transactions.url = `/api/v1/account/${props.id}/transactions`;
    this.pendingTransactions.url = `/api/v1/account/${props.id}/transactions?pending=1`;
  }

  async setSettings(settings: AccountSettings): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
      startDate: settings.startDate?.toISODate(),
      tracking: settings.tracking,
    });

    if (response.ok) {
      runInAction(() => {
        this.closed = settings.closed ?? this.closed;

        if (this.closed) {
          this.institution.closeAccount(this);
        }

        this.startDate = settings.startDate ?? this.startDate;
        this.tracking = settings.tracking ?? this.tracking;
      });
    }
  }

  async addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<ErrorProps[] | null> {
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
    } else {
      const body = await response.body()

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }

    throw new Error('Error response received');
  }
   
  delete(): void {
    this.institution.deleteAccount(this);
  }

  async updateOfflineAccount (name: string, type: AccountType, subtype: string): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
      name,
      type,
      subtype,
    });

    if (response.ok) {
      runInAction(() => {
        this.name = name;
        this.type = type;
        this.subtype = subtype;
      });
    }
  }
}

export default Account;
