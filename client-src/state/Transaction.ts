import { makeAutoObservable, runInAction } from 'mobx';
import {
  Error,
  TransactionType,
  TransactionProps,
  isUpdateTransactionCategoryResponse,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
} from '../../common/ResponseTypes';
import {
  NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  TransactionInterface,
} from './State';
import { getBody, httpDelete, patchJSON } from './Transports';

class Transaction implements TransactionInterface {
  id: number | null;

  amount: number;

  date: string;

  type: TransactionType;

  name: string;

  categories: TransactionCategoryInterface[];

  instituteName: string;

  accountName: string;

  store: StoreInterface;

  constructor(store: StoreInterface, props: TransactionProps) {
    this.store = store;

    this.id = props.id;
    this.date = props.date;
    this.type = props.type;
    if (props.accountTransaction) {
      this.name = props.accountTransaction.name;
      this.amount = props.accountTransaction.amount;
      this.instituteName = props.accountTransaction.account.institution.name;
      this.accountName = props.accountTransaction.account.name;
    }
    else {
      switch (props.type) {
        case TransactionType.REBALANCE_TRANSACTION:
          this.name = 'Category Rebalance';
          break;

        case TransactionType.FUNDING_TRANSACTION:
          this.name = 'Caetgory Funding';
          break;

        default:
          this.name = 'Unknown';
      }

      this.amount = 0;
      this.instituteName = '';
      this.accountName = '';
    }
    this.categories = props.transactionCategories;

    makeAutoObservable(this);
  }

  async updateTransactionCategories(
    transactionCategories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
  ): Promise<null> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await patchJSON(`/api/transaction/${this.id}`, { splits: transactionCategories });

    if (response.ok) {
      const body = await getBody(response);

      if (isUpdateTransactionCategoryResponse(body)) {
        runInAction(() => {
          if (this.id === null) {
            throw new Error('transaction has a null id');
          }

          this.store.categoryTree.updateBalances(body.categories);
          if (this.store.uiState.selectedCategory && !body.splits.some(
            (c) => (this.store.uiState.selectedCategory && c.categoryId === this.store.uiState.selectedCategory.id),
          )) {
            if (this.store.uiState.selectedCategory.type === 'LOAN') {
              this.store.uiState.selectedCategory.getLoanTransactions();
            }

            this.store.uiState.selectedCategory.removeTransaction(this.id);
          }
        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async updateCategoryTransfer(
    values: {
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[];
      date: string;
    },
  ): Promise<null> {
    if (this.id === null) {
      throw new Error('transaction has a null id');
    }

    const response = await patchJSON(`/api/category-transfer/${this.id}`, { ...values, type: 3 });

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
  true
);

export default Transaction;
