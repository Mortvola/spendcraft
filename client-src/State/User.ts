import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  ApiResponse, Error, isErrorResponse, isUserProps,
} from '../../common/ResponseTypes';
import { StoreInterface, UserInterface } from './Types';

class User implements UserInterface {
  username: string | null = null;

  email: string | null = null;

  pendingEmail: string | null = null;

  authenticated = false;

  roles: string[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    const response = await Http.get<ApiResponse<unknown>>('/api/v1/user');

    if (response.ok) {
      const { data } = await response.body();

      runInAction(() => {
        if (isUserProps(data)) {
          this.username = data.username;
          this.email = data.email;
          this.pendingEmail = data.pendingEmail ?? null;
          this.roles = data.roles;
        }
      });
    }
  }

  async update(email: string): Promise<Error[] | null> {
    const response = await Http.patch('/api/v1/user', { email });

    const body = await response.body();

    if (response.ok) {
      runInAction(() => {
        if (isUserProps(body)) {
          this.username = body.username;
          this.email = body.email;
          this.pendingEmail = body.pendingEmail ?? null;
        }
      });

      return null;
    }

    if (isErrorResponse(body)) {
      return body.errors;
    }

    throw new Error('invalid response');
  }

  // eslint-disable-next-line class-methods-use-this
  async resendVerificationLink(): Promise<Error[] | null> {
    const response = await Http.post('/api/v1/user/pending-email/resend');

    const body = await response.body();

    if (response.ok) {
      return null;
    }

    if (isErrorResponse(body)) {
      return body.errors;
    }

    throw new Error('invalid response');
  }

  async deletePendingEmail(): Promise<Error[] | null> {
    const response = await Http.delete('/api/v1/user/pending-email');

    const body = await response.body();

    if (response.ok) {
      runInAction(() => {
        if (isUserProps(body)) {
          this.username = body.username;
          this.email = body.email;
          this.pendingEmail = body.pendingEmail ?? null;
        }
      });

      return null;
    }

    if (isErrorResponse(body)) {
      return body.errors;
    }

    throw new Error('invalid response');
  }
}

export default User;
