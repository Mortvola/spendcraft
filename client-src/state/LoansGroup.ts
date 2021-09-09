import { makeAutoObservable, runInAction } from 'mobx';
import {
  LoansGroupProps, Error, isErrorResponse, isAddCategoryResponse, CategoryBalanceProps,
} from '../../common/ResponseTypes';
import Category from './Category';
import { GroupInterface, StoreInterface } from './State';
import { getBody, httpDelete, httpPost } from './Transports';

class LoansGroup implements GroupInterface {
  id: number;

  name: string;

  type: string;

  categories: Category[] = [];

  system = true;

  store: StoreInterface;

  constructor(props: LoansGroupProps | LoansGroup, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.store = store;

    makeAutoObservable(this);

    if (props.categories && props.categories.length > 0) {
      props.categories.forEach((l) => {
        const loan = new Category(l, this.store);
        this.categories.push(loan);
      });
    }
  }

  insertCategory(category: Category): void {
  }

  findCategory(categoryId: number): Category | null {
    const loan = this.categories.find((c) => c.id === categoryId);

    if (loan) {
      return loan;
    }

    return null;
  }

  async addLoan(
    name: string,
    amount: number,
    rate: number,
    startDate: string,
  ): Promise<null| Error[]> {
    const response = await httpPost('/api/loans', {
      name, amount, rate, startDate,
    });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else if (isAddCategoryResponse(body)) {
      runInAction(() => {
        // Find the position where this new category should be inserted.
        const index = this.categories.findIndex(
          (g) => body.name.toLowerCase().localeCompare(g.name.toLowerCase()) < 0,
        );

        if (index === -1) {
          this.categories.push(new Category(body, this.store));
        }
        else {
          this.categories = [
            ...this.categories.slice(0, index),
            new Category(body, this.store),
            ...this.categories.slice(index),
          ];
        }
      });
    }

    return null;
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    this.categories.forEach((c) => {
      const balance = balances.find((b) => b.id === c.id);
      if (balance) {
        c.balance = balance.balance;
      }
    });
  }

  async deleteCategory(categoryId: number): Promise<null | Array<Error>> {
    const index = this.categories.findIndex((c) => c.id === categoryId);

    if (index !== -1) {
      const response = await httpDelete(`/api/groups/${this.id}/categories/${categoryId}`);

      const body = await getBody(response);

      if (!response.ok) {
        if (isErrorResponse(body)) {
          return body.errors;
        }
      }
      else {
        runInAction(() => {
          this.categories.splice(index, 1);
        });
      }
    }

    return null;
  }
}

export const isLoansGroup = (r: unknown): r is LoansGroup => (
  (r as LoansGroup).id !== undefined
  && (r as LoansGroup).name === 'Loans'
  && (r as LoansGroup).system !== undefined
  && (r as LoansGroup).system
  && (r as LoansGroup).categories !== undefined
);

export default LoansGroup;
