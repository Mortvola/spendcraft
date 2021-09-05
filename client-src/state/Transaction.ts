import { DateTime } from 'luxon';
import { makeAutoObservable, runInAction } from 'mobx';
import {
  Error,
  TransactionType,
  TransactionProps,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
  isUpdateTransactionResponse,
  CategoryTransferProps,
} from '../../common/ResponseTypes';
import {
  NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  TransactionInterface,
} from './State';
import { getBody, httpDelete, httpPatch } from './Transports';

class Transaction implements TransactionInterface {
  id: number | null;

  amount: number;

  date: string;

  createdAt: DateTime;

  type: TransactionType;

  name: string;

  comment = '';

  categories: TransactionCategoryInterface[] = [];

  instituteName: string;

  accountName: string;

  accountId: number | null = null;

  paymentChannel: string | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface, props: TransactionProps) {
    this.store = store;

    this.id = props.id;
    this.date = props.date;
    this.createdAt = DateTime.fromISO(props.createdAt);
    this.type = props.type;
    this.comment = props.comment;
    if (props.accountTransaction) {
      this.name = props.accountTransaction.name;
      this.amount = props.accountTransaction.amount;
      this.instituteName = props.accountTransaction.account.institution.name;
      this.accountName = props.accountTransaction.account.name;
      this.accountId = props.accountTransaction.account.id;
      this.paymentChannel = props.accountTransaction.paymentChannel;
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
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await httpPatch(`/api/transaction/${this.id}`, values);

    if (response.ok) {
      const body = await getBody(response);

      if (isUpdateTransactionResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.categories);

          this.categories = body.transaction.transactionCategories;

          const dateChanged = this.date !== body.transaction.date;
          this.date = body.transaction.date;

          this.amount = body.transaction.accountTransaction.amount;
          this.name = body.transaction.accountTransaction.name;
          this.comment = body.transaction.comment;

          // Remove the transaction from the selected category, if any, if the transaction
          // no longer has the selected category in its splits.
          if (this.store.uiState.selectedCategory) {
            if (!body.transaction.transactionCategories.some(
              (c) => (this.store.uiState.selectedCategory && c.categoryId === this.store.uiState.selectedCategory.id),
            ) && (body.transaction.transactionCategories.length !== 0
            || this.store.uiState.selectedCategory.id !== this.store.categoryTree.systemIds.unassignedId)) {
              if (this.store.uiState.selectedCategory.type === 'LOAN') {
                this.store.uiState.selectedCategory.getLoanTransactions();
              }

              this.store.uiState.selectedCategory.removeTransaction(this.id);
            }
            else if (dateChanged) {
              this.store.uiState.selectedCategory.removeTransaction(this.id);
              this.store.uiState.selectedCategory.insertTransaction(this);
            }
          }

          if (this.store.uiState.selectedAccount
            && this.store.uiState.selectedAccount.id === this.accountId
            && dateChanged) {
            this.store.uiState.selectedAccount.removeTransaction(this.id);
            this.store.uiState.selectedAccount.insertTransaction(this);
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

    const response = await httpPatch(`/api/category-transfer/${this.id}`, { ...values, type: 3 });

    if (response.ok) {
      const body = await getBody(response);

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
            this.store.uiState.selectedCategory.removeTransaction(this.id);
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

    const response = await httpDelete(`/api/transaction/${this.id}`);

    if (response.ok) {
      const body = await getBody(response);

      if (isDeleteTransactionResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.balances);
          this.store.accounts.updateBalances(body.acctBalances);
          this.store.register.removeTransaction(this.id);
        });

        return null;
      }
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
}

export const isTransaction = (r: unknown): r is Transaction => (
  (r !== undefined && r !== null)
);

export default Transaction;
