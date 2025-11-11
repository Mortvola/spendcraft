import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  AccountProps, AddTransactionResponse, ErrorProps,
  isAddTransactionResponse, TrackingType, AccountType,
  ApiError,
  AddStatementResponse,
  StatementsResponse,
  StatementProps,
  isErrorResponse,
} from '../../common/ResponseTypes';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  AddTransactionRequest,
  AccountSettings,
  AddStatementRequest,
} from './Types';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';
import Statement from './Statement';

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
  accessor statements: Statement[] = [];

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

   
  async addStatement(
    startDate: string,
    endDate: string,
    startingBalance: number,
    endingBalance: number,
  ): Promise<ApiError[] | null> {
    const response = await Http.post<AddStatementRequest, AddStatementResponse>(`/api/v1/account/${this.id}/statements`, {
      startDate, endDate, startingBalance, endingBalance,
    });

    if (response.ok) {
      const props = await response.body();

      runInAction(() => {
        const statement = new Statement(props)

        this.statements = [
          ...this.statements,
          statement,
        ].sort((a, b) => {
          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return -1
          }

          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return 1
          }

          return 0
        })

        for (const transactionId of props.transactions) {
          const trx = this.transactions.transactions.find((trx) => trx.id === transactionId)
          if (trx) {
            trx.statementId = statement.id
          }
        }

        this.store.uiState.selectStatement(statement)
      })

      return null;
    }

    throw new Error('Error response received');
  }

  async getStatements(): Promise<void> {
    const response = await Http.get<StatementsResponse>(`/api/v1/account/${this.id}/statements`)

    if (response.ok) {
      const body = await response.body()

      runInAction(() => {
        this.statements = body.map((props) => new Statement(props))
          .sort((a, b) => {
            if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
              return -1
            }

            if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
              return 1
            }

            return 0
          })

        const statement = this.statements.find((s) => s.id === this.store.uiState.selectedStatement?.id)
        this.store.uiState.selectStatement(statement ?? null)
      })
    } else {
      throw new Error('Error response received');
    }
  }

  updateStatement(props: StatementProps): void {
    const statement = this.statements.find((s) => s.id === props.id)

    if (statement) {
      runInAction(() => {
        statement.credits = props.credits
        statement.debits = props.debits
      })
    }
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
