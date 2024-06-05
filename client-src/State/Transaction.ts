import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  Error,
  TransactionType,
  TransactionProps,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
  isUpdateTransactionResponse,
  CategoryTransferProps,
  Location,
} from '../../common/ResponseTypes';
import {
  NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  TransactionInterface,
} from './State';

class Transaction implements TransactionInterface {
  id: number | null;

  amount: number;

  principle: number | null;

  date: DateTime;

  type: TransactionType;

  name: string;

  comment = '';

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

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await Http.patch(`/api/v1/transaction/${this.id}`, values);

    if (response.ok) {
      const body = await response.body();

      if (isUpdateTransactionResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.categories);

          this.categories = body.transaction.transactionCategories;

          const dateChanged = this.date !== DateTime.fromISO(body.transaction.date);
          this.date = DateTime.fromISO(body.transaction.date);

          this.amount = body.transaction.accountTransaction.amount;
          this.principle = body.transaction.accountTransaction.principle;
          this.name = body.transaction.accountTransaction.name;
          this.comment = body.transaction.comment;

          // Remove the transaction from the selected category, if any, if the transaction
          // no longer has the selected category in its splits.
          if (this.store.uiState.selectedCategory) {
            if (this.store.categoryTree.unassignedCat === null) {
              throw new Error('category is null');
            }

            if ((body.transaction.transactionCategories.length === 0
                && this.store.uiState.selectedCategory.id !== this.store.categoryTree.unassignedCat.id)
              || (body.transaction.transactionCategories.length !== 0
                && !body.transaction.transactionCategories.some(
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

          const account = this.store.accounts.findAccount(body.acctBalances[0].id);

          if (account) {
            account.balance = body.acctBalances[0].balance;
          }
        });

        return null;
      }
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

    const response = await Http.delete(`/api/v1/transaction/${this.id}`);

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
