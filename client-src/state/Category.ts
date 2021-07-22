import { makeAutoObservable, runInAction } from 'mobx';
import {
  CategoryProps, isErrorResponse, Error,
  isUpdateCategoryResponse,
} from '../../common/ResponseTypes';
import { getBody, patchJSON } from './Transports';

class Category {
  id: number;

  name: string;

  system: boolean;

  balance: number;

  groupId: number | null = null;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;
    this.balance = props.balance;

    makeAutoObservable(this);
  }

  async update(groupId: number, name: string): Promise<null | Array<Error>> {
    const response = await patchJSON(`/api/groups/${groupId}/categories/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isUpdateCategoryResponse(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
  }
}

export default Category;
