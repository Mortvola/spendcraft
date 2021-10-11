import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { runInAction } from 'mobx';
import {
  BalanceProps, Error, isErrorResponse, isUpdateBalanceResponse,
} from '../../common/ResponseTypes';
import { BalanceInterface, BalancesInterface } from './State';

class Balance implements BalanceInterface {
  id: number;

  date: DateTime;

  balance: number;

  balances: BalancesInterface;

  constructor(balances: BalancesInterface, props: BalanceProps) {
    this.balances = balances;
    this.id = props.id;
    this.date = DateTime.fromISO(props.date);
    this.balance = props.balance;
  }

  async delete(): Promise<null | Error[]> {
    if (this.id === null) {
      throw new Error('balance has a null id');
    }

    const response = await Http.delete(`/api/balance/${this.id}`);

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
  ): Promise<Error[] | null> {
    if (this.balances.account === null) {
      throw new Error('account is null');
    }

    const response = await Http.patch(`/api/account/${this.balances.account.id}/balances/${this.id}`, values);

    const body = await response.body();

    if (response.ok) {
      if (isUpdateBalanceResponse(body)) {
        runInAction(() => {
          const prevDate = this.date;

          this.date = DateTime.fromISO(body.date);
          this.balance = body.balance;

          if (prevDate !== this.date) {
            this.balances.removeBalance(this);
            this.balances.insertBalance(this);
          }
        });

        return null;
      }
    }
    else if (isErrorResponse(body)) {
      return body.errors;
    }

    throw new Error('Error response received');
  }
}

export default Balance;
