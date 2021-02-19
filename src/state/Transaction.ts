import { makeAutoObservable } from 'mobx';
import {
  TransactionProps, TransactionCategoryInterface,
  isUpdateTransactionCategoryResponse,
} from './ResponseTypes';
import { StoreInterface } from './State';
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

  async updateTransactionCategory(request: unknown): Promise<null> {
    const response = await patchJSON(`/transaction/${this.id}`, request);

    const body = await getBody(response);

    if (isUpdateTransactionCategoryResponse(body)) {
      this.store.categoryTree.updateBalances(body.categories);
      this.store.register.updateTransactionCategories(this.id, body.splits, body.categories);

      return null;
    }

    throw new Error('invalid response');
  }
}

export default Transaction;
