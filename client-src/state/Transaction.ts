import { makeAutoObservable, runInAction } from 'mobx';
import {
  TransactionType,
  TransactionProps,
  isUpdateTransactionCategoryResponse,
  isUpdateCategoryTransferResponse,
  isDeleteTransactionResponse,
} from '../../common/ResponseTypes';
import { NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface } from './State';
import { getBody, httpDelete, patchJSON } from './Transports';

class Transaction {
  id: number;

  amount: number;

  date: string;

  type: TransactionType;

  name: string;

  categories: Array<TransactionCategoryInterface>;

  instituteName: string;

  accountName: string;

  store: StoreInterface;

  constructor(store: StoreInterface, props: TransactionProps) {
    this.store = store;

    this.id = props.id;
    this.amount = props.amount;
    this.date = props.date;
    this.type = props.type;
    this.name = props.name;
    this.instituteName = props.instituteName;
    this.accountName = props.accountName;

    this.categories = props.categories;

    makeAutoObservable(this);
  }

  async updateTransactionCategory(
    categories: Array<TransactionCategoryInterface | NewTransactionCategoryInterface>,
  ): Promise<null> {
    const response = await patchJSON(`/transaction/${this.id}`, { splits: categories });

    const body = await getBody(response);

    if (isUpdateTransactionCategoryResponse(body)) {
      runInAction(() => {
        this.store.categoryTree.updateBalances(body.categories);
        this.store.register.updateTransactionCategories(this.id, body.splits, body.categories);
      });

      return null;
    }

    throw new Error('invalid response');
  }

  async updateCategoryTransfer(
    values: {
      categories: TransactionCategoryInterface[];
      date: string;
    },
  ): Promise<null> {
    const response = await patchJSON(`/category_transfer/${this.id}`, { ...values, type: 3 });

    if (response.ok) {
      const body = await getBody(response);

      if (isUpdateCategoryTransferResponse(body)) {
        runInAction(() => {
          this.store.categoryTree.updateBalances(body.balances);
          this.store.register.updateTransactionCategories(
            this.id, body.transaction.categories, body.balances,
          );
        });

        return null;
      }
    }

    throw new Error('invalid response');
  }

  async delete(): Promise<null | Array<Error>> {
    const response = await httpDelete(`/transaction/${this.id}`);

    if (response.ok) {
      const body = await getBody(response);

      if (isDeleteTransactionResponse(body)) {
        runInAction(() => {
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
      amount = this.categories.reduce((accum, item) => (
        accum + (item.categoryId === categoryId ? item.amount : 0)
      ), 0);
    }

    return amount;
  }
}

export default Transaction;
