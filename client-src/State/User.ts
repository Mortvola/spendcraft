import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { Error, isErrorResponse, isUserProps } from '../../common/ResponseTypes';
import { UserInterface } from './State';

class User implements UserInterface {
  username: string | null = null;

  email: string | null = null;

  pendingEmail: string | null = null;

  authenticated = false;

  admin = false;

  store: unknown;

  constructor(store: unknown) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    const response = await Http.get('/api/v1/user');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isUserProps(body)) {
          this.username = body.username;
          this.email = body.email;
          this.pendingEmail = body.pendingEmail ?? null;
          this.admin = body.admin;
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
