import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import {
  ApiError,
  ApiResponse,
  BalanceProps, ErrorProps, isErrorResponse, isUpdateBalanceResponse,
  UpdateBalanceResponse,
} from '../../common/ResponseTypes';
import { BalanceInterface, BalancesInterface } from './Types';

class Balance implements BalanceInterface {
  id: number;

  @observable
  accessor date: DateTime;

  @observable
  accessor balance: number;

  balances: BalancesInterface;

  constructor(balances: BalancesInterface, props: BalanceProps) {
    this.balances = balances;
    this.id = props.id;
    this.date = DateTime.fromISO(props.date);
    this.balance = props.balance;
  }

  async delete(): Promise<null | ErrorProps[]> {
    if (this.id === null) {
      throw new Error('balance has a null id');
    }

    const response = await Http.delete(`/api/v1/balance/${this.id}`);

    if (response.ok) {
      runInAction(() => {
        this.balances.removeBalance(this);
      });

      return null;
    }

    throw new Error('invalid response');
  }

  async update(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<ApiError[] | null> {
    if (this.balances.account === null) {
      throw new Error('account is null');
    }

    const response = await Http.patch<unknown, ApiResponse<UpdateBalanceResponse>>(
      `/api/v1/account/${this.balances.account.id}/balances/${this.id}`,
      values,
    );

    const body = await response.body();

    if (response.ok) {
      runInAction(() => {
        if (body.data) {
          const prevDate = this.date;

          this.date = DateTime.fromISO(body.data.date);
          this.balance = body.data.balance;

          if (prevDate !== this.date) {
            this.balances.removeBalance(this);
            this.balances.insertBalance(this);
          }
        }
      });

      return null;
    }
    else if (body.errors) {
      return body.errors;
    }

    throw new Error('Error response received');
  }
}

export default Balance;
