import { makeAutoObservable, runInAction } from 'mobx';
import {
  TransactionProps,
  isUpdateTransactionCategoryResponse,
} from '../../common/ResponseTypes';
import { StoreInterface, TransactionCategoryInterface } from './State';
import { getBody, patchJSON } from './Transports';

class Transaction {
  id: number;

  amount: number;

  date: string;

  type: string;

  name: string;

  categories: Array<TransactionCategoryInterface>;

  store: StoreInterface;

  constructor(store: StoreInterface, props: TransactionProps) {
    this.store = store;

    this.id = props.id;
    this.amount = props.amount;
    this.date = props.date;
    this.type = props.type;
    this.name = props.name;
    this.categories = props.categories;

    makeAutoObservable(this);
  }

  async updateTransactionCategory(categories: Array<TransactionCategoryInterface>): Promise<null> {
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
