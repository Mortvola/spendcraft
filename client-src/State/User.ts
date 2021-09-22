import { makeAutoObservable, runInAction } from 'mobx';
import { isUserProps } from '../../common/ResponseTypes';
import { httpGet } from './Transports';

class User {
  username: string | null = null;

  store: unknown;

  constructor(store: unknown) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    const response = await httpGet('/api/user');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isUserProps(body)) {
          this.username = body.username;
        }
      });
    }
  }
}

export default User;
