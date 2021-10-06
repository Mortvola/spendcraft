import { makeAutoObservable, runInAction } from 'mobx';
import { Error, isErrorResponse, isUserProps } from '../../common/ResponseTypes';
import { UserInterface } from './State';
import Http from '@mortvola/http';

class User implements UserInterface {
  username: string | null = null;

  email: string | null = null;

  pendingEmail: string | null = null;

  store: unknown;

  constructor(store: unknown) {
    makeAutoObservable(this);

    this.store = store;
  }

  async load(): Promise<void> {
    const response = await Http.get('/api/user');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isUserProps(body)) {
          this.username = body.username;
          this.email = body.email;
          this.pendingEmail = body.pendingEmail ?? null;
        }
      });
    }
  }

  async update(email: string): Promise<Error[] | null> {
    const response = await Http.patch('/api/user', { email });

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
    const response = await Http.post('/api/user/pending-email/resend');

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
    const response = await Http.delete('/api/user/pending-email');

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
