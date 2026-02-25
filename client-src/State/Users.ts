import Http from "@mortvola/http";
import { StoreInterface, UsersResponse } from "./Types";
import { observable, runInAction } from "mobx";
import { ApiResponse } from "../../common/ResponseTypes";
import UserRecord from "./UserRecord";

class Users {
  @observable
  accessor users: UserRecord[] = [];

  store: StoreInterface;

  initialized = false;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async load() {
    const response = await Http.get<ApiResponse<UsersResponse>>('/api/v1/admin/users');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const { data } = await response.body();

    if (data) {
      runInAction(() => {
        this.users = data.map((props) => {
          return new UserRecord(props)
        });

        this.initialized = true;
      });
    }
  }
}

export default Users;
