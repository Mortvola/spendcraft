import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import {
  CategoryProps, Error, GroupProps, isErrorResponse, isGroupProps,
  isAddCategoryResponse,
} from '../../common/ResponseTypes';
import {
  getBody, httpDelete, patchJSON, postJSON,
} from './Transports';

class Group {
  id: number;

  name: string;

  system = false;

  categories: Array<Category> = [];

  constructor(props: GroupProps) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;

    if (props.categories && props.categories.length > 0) {
      props.categories.forEach((c) => {
        const category = new Category(c);
        this.categories.push(category);
      });
    }

    makeAutoObservable(this);
  }

  async addCategory(groupId: number, name: string): Promise<null| Array<Error>> {
    const response = await postJSON(`/groups/${this.id}/categories`, { groupId, name });

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
            this.categories.push(new Category(body));
          }
          else {
            this.categories = [
              ...this.categories.slice(0, index),
              new Category(body),
              ...this.categories.slice(index),
            ];
          }
        }
      });
    }

    return null;
  }

  async update(name: string): Promise<null | Array<Error>> {
    const response = await patchJSON(`/groups/${this.id}`, { name });

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

  async deleteCategory(groupId: number, categoryId: number): Promise<null | Array<Error>> {
    const index = this.categories.findIndex((c) => c.id === categoryId);

    if (index !== -1) {
      const response = await httpDelete(`/groups/${groupId}/categories/${categoryId}`);

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

  updateBalances(balances: Array<CategoryProps>): void {
    this.categories.forEach((c) => {
      const balance = balances.find((b) => b.id === c.id);
      if (balance) {
        c.balance = balance.balance;
      }
    });
  }
}

export default Group;
