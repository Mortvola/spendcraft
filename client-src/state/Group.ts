import { makeAutoObservable, runInAction } from 'mobx';
import Category, { isCategory } from './Category';
import {
  CategoryProps, Error, GroupProps, isErrorResponse, isGroupProps,
  isAddCategoryResponse,
} from '../../common/ResponseTypes';
import {
  getBody, httpDelete, patchJSON, postJSON,
} from './Transports';
import { GroupInterface, StoreInterface } from './State';

class Group implements GroupInterface {
  id: number;

  name: string;

  system = false;

  categories: Category[] = [];

  store: StoreInterface;

  constructor(props: GroupProps | Group, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;
    this.store = store;

    if (props.categories && props.categories.length > 0) {
      props.categories.forEach((c) => {
        const category = new Category(c, this.store);
        this.categories.push(category);
      });
    }

    makeAutoObservable(this);
  }

  findCategory(categoryId: number): Category | null {
    const cat = this.categories.find((c) => c.id === categoryId);

    if (cat) {
      return cat;
    }

    return null;
  }

  async addCategory(name: string): Promise<null| Error[]> {
    const response = await postJSON(`/api/groups/${this.id}/categories`, { groupId: this.id, name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isAddCategoryResponse(body)) {
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
        }
      });
    }

    return null;
  }

  async update(name: string): Promise<null | Array<Error>> {
    const response = await patchJSON(`/api/groups/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isGroupProps(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
  }

  async deleteCategory(categoryId: number): Promise<null | Array<Error>> {
    const index = this.categories.findIndex((c) => c.id === categoryId);
    if (index !== -1) {
      const response = await httpDelete(`/api/groups/${this.id}/categories/${categoryId}`);

      if (!response.ok) {
        const body = await getBody(response);

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

  updateBalances(balances: CategoryProps[]): void {
    this.categories.forEach((c) => {
      const balance = balances.find((b) => b.id === c.id);
      if (balance) {
        c.balance = balance.balance;
      }
    });
  }
}

export const isGroup = (r: unknown): r is Group => (
  (r as Group).id !== undefined
  && (r as Group).name !== undefined
  && (r as Group).system !== undefined
  && (r as Group).categories !== undefined
);

export const isCategoriesArray = (r: unknown): r is Category[] => (
  (Array.isArray(r))
  && (r.length === 0 || isCategory((r as Category[])[0]))
);

export default Group;
