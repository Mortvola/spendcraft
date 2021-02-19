import { makeAutoObservable, runInAction } from 'mobx';
import {
  CategoryProps, isErrorResponse,
  isCategoryUpdateResponse,
} from './ResponseTypes';
import { getBody, patchJSON } from './Transports';

class Category {
  id: number;

  name: string;

  system: boolean;

  balance: number;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;
    this.balance = props.balance;

    makeAutoObservable(this);
  }

  async update(groupId: number, name: string): Promise<null | Array<string>> {
    const response = await patchJSON(`/groups/${groupId}/categories/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isCategoryUpdateResponse(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
  }
}

export default Category;
