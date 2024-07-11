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
import { db } from './Database';

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

  reconciled = false;

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
      this.reconciled = props.accountTransaction.reconciled;
      this.accountOwner = props.accountTransaction.accountOwner;
      this.pending = props.accountTransaction.pending;
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

    if (props.transactionCategories) {
      this.categories = props.transactionCategories;
    }

    makeAutoObservable(this);
  }

  static async updateDatabase(props: TransactionProps): Promise<void> {
    const trx = db.transaction(['transactions'], 'readwrite');

    const transactionStore = trx.objectStore('transactions');

    const transaction = await transactionStore.get(props.id!);

    try {
      if (!transaction || transaction.data.version < props.version) {
        // eslint-disable-next-line no-await-in-loop
        await transactionStore.put({
          id: props.id,
          accountId: props.accountTransaction.account.id,
          categories: props.transactionCategories.map((tc) => tc.categoryId),
          data: props,
        })
      }
    }
    catch (error) {
      console.log(`${error}, id = ${props.id}`)
    }
  }

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null | ApiError[]> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.patch<unknown, ApiResponse<UpdateTransactionResponse>>(`/api/v1/transactions/${this.id}`, { version: this.version, ...values });

    if (response.ok) {
      const body = await response.body();

      if (body.errors) {
        return body.errors;
      }

      if (body.data) {
        const updateTransactionResponse = body.data;

        await Transaction.updateDatabase(updateTransactionResponse.transaction);

        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(updateTransactionResponse.categories);

          const transactinProps = updateTransactionResponse.transaction;

          this.categories = transactinProps.transactionCategories;

          const dateChanged = this.date !== DateTime.fromISO(transactinProps.date);
          this.date = DateTime.fromISO(transactinProps.date);

          this.amount = transactinProps.accountTransaction.amount;
          this.principle = transactinProps.accountTransaction.principle;
          this.name = transactinProps.accountTransaction.name;
          this.comment = transactinProps.comment;
          this.version = transactinProps.version;

          // Remove the transaction from the selected category, if any, if the transaction
          // no longer has the selected category in its splits.
          if (this.store.uiState.selectedCategory) {
            if (this.store.categoryTree.unassignedCat === null) {
              throw new Error('category is null');
            }

            if ((transactinProps.transactionCategories.length === 0
                && this.store.uiState.selectedCategory.id !== this.store.categoryTree.unassignedCat.id)
              || (transactinProps.transactionCategories.length !== 0
                && !transactinProps.transactionCategories.some(
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

          const account = this.store.accounts.findAccount(updateTransactionResponse.acctBalances[0].id);

          if (account) {
            account.balance = updateTransactionResponse.acctBalances[0].balance;
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

    const response = await Http.patch(`/api/v1/category-transfer/${this.id}`, { ...values, type: 3 });

    if (response.ok) {
      const body = await response.body();

      if (isUpdateCategoryTransferResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.balances);
          this.categories = body.transaction.transactionCategories;

          if (this.store.uiState.selectedCategory && !body.transaction.transactionCategories.some(
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

    const response = await Http.delete(`/api/v1/transactions/${this.id}`);

    if (response.ok) {
      const body = await response.body();

      if (isDeleteTransactionResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.categories);
          this.store.accounts.updateBalances(body.acctBalances);
          this.store.register.removeTransaction(this.id);
        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async dedup(): Promise<null | Error[]> {
    const response = await Http.post(`/api/v1/transactions/${this.id}/dedup`);

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

  toggleReconciled(): void {
    runInAction(() => {
      this.reconciled = !this.reconciled;
    })
  }
}

export const isTransaction = (r: unknown): r is Transaction => (
  (r !== undefined && r !== null)
);

export default Transaction;
