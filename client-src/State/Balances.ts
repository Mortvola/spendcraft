import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import {
  isBalancesResponse, isErrorResponse,
  AddBalanceResponse,
  ApiResponse,
  ApiError,
} from '../../common/ResponseTypes';
import {
  AccountInterface, BalanceInterface, BalancesInterface, StoreInterface,
} from './Types';
import Balance from './Balance';

class Balances implements BalancesInterface {
  @observable
  accessor account: AccountInterface| null = null;

  @observable
  accessor balances: Balance[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async load(account: AccountInterface): Promise<void> {
    if (account !== this.account) {
      const response = await Http.get(`/api/v1/account/${account.id}/balances`);

      if (!response.ok) {
        throw new Error('invalid response');
      }

      const body = await response.body();

      if (isBalancesResponse(body)) {
        runInAction(() => {
          this.balances = body.map((b) => new Balance(this, b));
        });
      }

      this.account = account;
    }
  }

  insertBalance(balance: Balance): void {
    const index = this.balances.findIndex((b) => balance.date >= b.date);

    if (index === -1) {
      this.balances.push(balance);
    }
    else {
      this.balances.splice(index, 0, balance)
    }
  }

  removeBalance(balance: BalanceInterface): void {
    const index = this.balances.findIndex((b) => b.id === balance.id);

    if (index !== -1) {
      this.balances = [
        ...this.balances.slice(0, index),
        ...this.balances.slice(index + 1),
      ];
    }
  }

  async addBalance(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<ApiError[] | null> {
    if (this.account === null) {
      throw new Error('account is null');
    }

    const response = await Http.post<unknown, ApiResponse<AddBalanceResponse>>(
      `/api/v1/account/${this.account.id}/balances`,
      values,
    );

    const body = await response.body();

    if (response.ok) {
      runInAction(() => {
        if (body.data) {
          if (this.account === null) {
            throw new Error('account is null');
          }

          const balance = new Balance(this, body.data);

          this.insertBalance(balance);

          this.account.balance = body.data.accountBalance;
        }
      });

      return null;
    }
    else if (isErrorResponse(body.errors)) {
      return body.errors;
    }

    throw new Error('Error response received');
  }
}

export default Balances;
