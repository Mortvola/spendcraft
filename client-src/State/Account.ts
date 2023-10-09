import { makeObservable, observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  AccountProps, AddTransactionResponse, Error,
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

  plaidBalance: number | null;

  rate: number | null;

  institution: InstitutionInterface;

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    super(store, `/api/v1/account/${props.id}/transactions`);

    this.id = props.id;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.balance = props.balance;
    this.plaidBalance = props.plaidBalance;
    this.rate = props.rate;
    this.institution = institution;

    makeObservable(this, {
      name: observable,
      plaidBalance: observable,
      rate: observable,
      institution: observable,
    });

    this.store = store;
  }

  async setClosed(closed: boolean): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
      closed,
    });

    if (response.ok) {
      runInAction(() => {
        this.closed = closed;
        this.institution.closeAccount(this);
      });
    }
  }

  async getPendingTransactions(index = 0): Promise<void> {
    return this.pendingQuery.fetch(
      `/api/v1/account/${this.id}/transactions/pending`,
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
    const response = await Http.post<AddTransactionRequest, AddTransactionResponse>(`/api/v1/account/${this.id}/transactions`, values);

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
