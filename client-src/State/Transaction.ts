import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  ErrorProps,
  TransactionType,
  TransactionProps,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
  CategoryTransferProps,
  Location,
  ApiError,
  ApiResponse,
  UpdateTransactionResponse,
  CategoryBalanceProps,
} from '../../common/ResponseTypes';
import {
  NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  TransactionInterface,
  TransactionTaxCategoryInterface,
} from './Types';

const hasBalances = (value: unknown): value is CategoryBalanceProps[] => (
  Array.isArray(value) && value.every((row: unknown) => (
    typeof row === 'object' && row !== null
    && 'id' in row && typeof row.id === 'number' && Number.isFinite(row.id)
    && 'balance' in row && typeof row.balance === 'number' && Number.isFinite(row.balance)
  ))
);

class Transaction implements TransactionInterface {
  @observable
  accessor id: number | null;

  @observable
  accessor amount: number;

  @observable
  accessor principle: number | null;

  @observable
  accessor date: DateTime;

  @observable
  accessor type: TransactionType;

  @observable
  accessor name: string;

  @observable
  accessor comment = '';

  @observable
  accessor version: number;

  @observable
  accessor categories: TransactionCategoryInterface[] = [];

  @observable
  accessor taxCategories: TransactionTaxCategoryInterface[] = [];

  @observable
  accessor instituteName: string;

  @observable
  accessor accountName: string;

  @observable
  accessor accountId: number | null = null;

  @observable
  accessor paymentChannel: string | null = null;

  @observable
  accessor location: Location | null = null;

  @observable
  accessor duplicateOfTransactionId: number | null = null;

  @observable
  accessor statementId: number | null = null;

  @observable
  accessor pending = false;

  @observable
  accessor accountOwner: string | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface, props: TransactionProps) {
    this.store = store;

    this.id = props.id;
    this.date = DateTime.fromISO(props.date);
    this.type = props.type;
    this.comment = props.comment;
    this.duplicateOfTransactionId = props.duplicateOfTransactionId;
    this.version = props.version;

    if (props.accountTransaction) {
      this.name = props.accountTransaction.name;
      this.amount = props.accountTransaction.amount;
      this.principle = props.accountTransaction.principle;
      this.instituteName = props.accountTransaction.account.institution.name;
      this.accountName = props.accountTransaction.account.name;
      this.accountId = props.accountTransaction.account.id;
      this.paymentChannel = props.accountTransaction.paymentChannel;
      this.location = props.accountTransaction.location;
      this.accountOwner = props.accountTransaction.accountOwner;
      this.pending = props.accountTransaction.pending;
      this.statementId = props.accountTransaction.statementId;
    }
    else {
      switch (props.type) {
        case TransactionType.REBALANCE_TRANSACTION:
          this.name = 'Category Rebalance';
          break;

        case TransactionType.FUNDING_TRANSACTION:
          this.name = 'Category Funding';
          break;

        default:
          this.name = 'Unknown';
      }

      this.amount = 0;
      this.principle = null;
      this.instituteName = '';
      this.accountName = '';
    }

    if (props.categories) {
      this.categories = props.categories.map((c, index) => ({
        id: index,
        categoryId: c.categoryId,
        amount: c.amount,
        comment: c.comment,
        funder: c.funder,
        fundingCategories: c.fundingCategories,
        includeFundingTransfers: c.includeFundingTransfers,
        baseAmount: c.baseAmount,
      }));
    }

    if (props.taxes) {
      this.taxCategories = props.taxes.map((t) => ({
        type: t.type,
        amount: t.amount,
      }))
    }
  }

  refresh(props: TransactionProps): void {
    // Construct before touching the cached object so malformed nested data cannot partially apply.
    const updated = new Transaction(this.store, props);
    if (props.id !== this.id || !updated.date.isValid || !Number.isFinite(updated.version)
      || !updated.categories.every((category) => Number.isFinite(category.categoryId) && Number.isFinite(category.amount))
      || !Number.isFinite(updated.amount)) throw new Error('Invalid transaction response');
    runInAction(() => {
      this.date = updated.date;
      this.type = updated.type;
      this.comment = updated.comment;
      this.version = updated.version;
      this.duplicateOfTransactionId = updated.duplicateOfTransactionId;
      this.categories = updated.categories;
      this.taxCategories = updated.taxCategories;
      this.name = updated.name;
      this.amount = updated.amount;
      this.principle = updated.principle;
      this.instituteName = updated.instituteName;
      this.accountName = updated.accountName;
      this.accountId = updated.accountId;
      this.paymentChannel = updated.paymentChannel;
      this.location = updated.location;
      this.accountOwner = updated.accountOwner;
      this.pending = updated.pending;
      this.statementId = updated.statementId;
    });
  }

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      statementId?: number | null,
      categories?: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
      taxCategories?: TransactionTaxCategoryInterface[],
    },
  ): Promise<null | ApiError[]> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.patch<unknown, ApiResponse<UpdateTransactionResponse>>(
      `/api/v1/transaction/${this.id}`,
      { version: this.version, ...values },
    );

    if (response.ok) {
      const { data, errors } = await response.body();

      if (errors) {
        return errors;
      }

      const transactionUpdate = data;

      if (transactionUpdate) {
        if (!hasBalances(transactionUpdate.categories) || !hasBalances(transactionUpdate.acctBalances)) {
          throw new Error('Invalid transaction balances response');
        }
        const previousStatementId = this.statementId;
        this.refresh(transactionUpdate.transaction);
        runInAction(() => {
          this.store.register.updateTransaction(transactionUpdate.transaction);
          this.store.categoryTree.updateBalances(transactionUpdate.categories);
          this.store.accounts.updateBalances(transactionUpdate.acctBalances);
          const account = this.accountId === null ? null : this.store.accounts.findAccount(this.accountId);
          if (transactionUpdate.statement && account) account.statements.updateStatement(transactionUpdate.statement);
        });
        const account = this.accountId === null ? null : this.store.accounts.findAccount(this.accountId);
        if (account && previousStatementId !== null
          && (!transactionUpdate.statement || previousStatementId !== transactionUpdate.statement.id)) {
          await account.statements.load();
        }

        return null;
      }
    }

    const body = await response.body();

    if (body.errors) {
      return body.errors
    }

    throw new Error('invalid response');
  }

  async updateCategoryTransfer(
    values: {
      categories: CategoryTransferProps[];
      date: string;
    },
  ): Promise<null> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.patch<unknown, ApiResponse<unknown>>(`/api/v1/category-transfer/${this.id}`, { ...values, type: this.type });

    if (response.ok) {
      const { data } = await response.body();

      if (isUpdateCategoryTransferResponse(data) && hasBalances(data.balances)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.refresh(data.transaction);
          this.store.categoryTree.updateBalances(data.balances);
          this.store.register.updateTransaction(data.transaction);

        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async delete(): Promise<null | ErrorProps[]> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.delete<ApiResponse<unknown>>(`/api/v1/transaction/${this.id}`);

    if (response.ok) {
      const { data } = await response.body();

      if (isDeleteTransactionResponse(data) && hasBalances(data.categories) && hasBalances(data.acctBalances)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(data.categories);
          this.store.accounts.updateBalances(data.acctBalances);
          this.store.register.removeTransaction(this.id);
        });

        const account = this.accountId === null ? null : this.store.accounts.findAccount(this.accountId);
        if (this.statementId !== null && account) await account.statements.load();
        return null;
      }
    }

    throw new Error('invalid response');
  }

  async dedup(): Promise<null | ErrorProps[]> {
    const response = await Http.post(`/api/v1/transaction/${this.id}/dedup`);

    if (response.ok) {
      runInAction(() => {
        this.duplicateOfTransactionId = null;
      });

      return null;
    }

    throw new Error('invalid response');
  }

  getAmountForCategory(
    categoryId: number,
  ): number {
    let { amount } = this;

    if (this.categories !== undefined && this.categories !== null
      && categoryId !== undefined && categoryId !== null
      && this.categories.some((c) => c.categoryId === categoryId)) {
      amount = this.categories.reduce((accum, item) => {
        if (item.categoryId === categoryId) {
          const amt = item.amount;
          // if (item.loanTransaction) {
          //   amt = item.loanTransaction.principle;
          // }

          return accum + amt;
        }

        return accum;
      }, 0);
    }

    return amount;
  }

  toggleReconciled(statementId: number): void {
    runInAction(() => {
      let newStatementId: number | null | undefined

      if (this.statementId === null) {
        newStatementId = statementId
      }
      else if (this.statementId === statementId) {
        newStatementId = null;
      }

      if (newStatementId !== undefined) {
        this.updateTransaction({ statementId: newStatementId })
      }
    })
  }
}

export const isTransaction = (r: unknown): r is Transaction => (
  (r !== undefined && r !== null)
);

export default Transaction;
