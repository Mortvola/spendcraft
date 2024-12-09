import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  Error,
  TransactionType,
  TransactionProps,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
  CategoryTransferProps,
  Location,
  ApiError,
  ApiResponse,
  UpdateTransactionResponse,
} from '../../common/ResponseTypes';
import {
  NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  TransactionInterface,
} from './Types';

class Transaction implements TransactionInterface {
  id: number | null;

  amount: number;

  principle: number | null;

  date: DateTime;

  type: TransactionType;

  name: string;

  comment = '';

  version: number;

  categories: TransactionCategoryInterface[] = [];

  instituteName: string;

  accountName: string;

  accountId: number | null = null;

  paymentChannel: string | null = null;

  location: Location | null = null;

  duplicateOfTransactionId: number | null = null;

  statementId: number | null = null;

  pending = false;

  accountOwner: string | null = null;

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

    makeAutoObservable(this);
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
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(transactionUpdate.categories);

          this.categories = transactionUpdate.transaction.categories.map((c, index) => ({
            id: index, categoryId: c.categoryId, amount: c.amount, comment: c.comment,
          }));

          // Determine if the date has changed
          const newDate = DateTime.fromISO(transactionUpdate.transaction.date)
          const dateChanged = this.date.year !== newDate.year
            || this.date.month !== newDate.month
            || this.date.day !== newDate.day;
          this.date = newDate;

          this.amount = transactionUpdate.transaction.accountTransaction.amount;
          this.principle = transactionUpdate.transaction.accountTransaction.principle;
          this.name = transactionUpdate.transaction.accountTransaction.name;
          this.statementId = transactionUpdate.transaction.accountTransaction.statementId;

          this.comment = transactionUpdate.transaction.comment;
          this.version = transactionUpdate.transaction.version;

          // Remove the transaction from the selected category, if any, if the transaction
          // no longer has the selected category in its splits.
          if (this.store.uiState.selectedCategory) {
            if (this.store.categoryTree.unassignedCat === null) {
              throw new Error('category is null');
            }

            if ((transactionUpdate.transaction.categories.length === 0
                && this.store.uiState.selectedCategory.id !== this.store.categoryTree.unassignedCat.id)
              || (transactionUpdate.transaction.categories.length !== 0
                && !transactionUpdate.transaction.categories.some(
                  (c) => (
                    this.store.uiState.selectedCategory && c.categoryId === this.store.uiState.selectedCategory.id
                  ),
                ))
            ) {
              this.store.uiState.selectedCategory.transactions.removeTransaction(this.id);
            }
            else if (dateChanged) {
              this.store.uiState.selectedCategory.transactions.removeTransaction(this.id);
              this.store.uiState.selectedCategory.transactions.insertTransaction(this);
            }
          }

          // Remove and re-insert the transaction if the
          // date has changed to ensure proper ordering
          if (this.store.uiState.selectedAccount
            && this.store.uiState.selectedAccount.id === this.accountId
            && dateChanged) {
            this.store.uiState.selectedAccount.transactions.removeTransaction(this.id);
            this.store.uiState.selectedAccount.transactions.insertTransaction(this);
          }

          const account = this.store.accounts.findAccount(transactionUpdate.acctBalances[0].id);

          if (account) {
            account.balance = transactionUpdate.acctBalances[0].balance;
          }
        });

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

      if (isUpdateCategoryTransferResponse(data)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(data.balances);
          this.categories = data.transaction.categories;

          if (this.store.uiState.selectedCategory && !data.transaction.categories.some(
            (c) => (this.store.uiState.selectedCategory && c.categoryId === this.store.uiState.selectedCategory.id),
          )) {
            this.store.uiState.selectedCategory.transactions.removeTransaction(this.id);
          }
        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async delete(): Promise<null | Error[]> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.delete<ApiResponse<unknown>>(`/api/v1/transaction/${this.id}`);

    if (response.ok) {
      const { data } = await response.body();

      if (isDeleteTransactionResponse(data)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(data.categories);
          this.store.accounts.updateBalances(data.acctBalances);
          this.store.register.removeTransaction(this.id);
        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async dedup(): Promise<null | Error[]> {
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
