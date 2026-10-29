import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { parseMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { DateTime } from 'luxon';
import { isAccountBalanceSeries } from '../../common/ResponseTypes';
import { AccountBalanceSeriesInterface, AccountInterface } from './Types';

// Read-only chart data derived by the server from existing Transactions.
// This cache has no persisted observation IDs or mutation API.
class AccountBalanceSeries implements AccountBalanceSeriesInterface {
  @observable
  accessor account: AccountInterface | null = null;

  @observable
  accessor points: { date: DateTime, balanceCents: MoneyCents }[] = [];

  async load(account: AccountInterface): Promise<void> {
    if (account === this.account) return;
    const response = await Http.get(`/api/v1/account/${account.id}/balances`);
    if (!response.ok) throw new Error('Unable to load account chart');
    const body = await response.body();
    if (!isAccountBalanceSeries(body)) throw new Error('Invalid account chart response');
    const points = body.map((point) => ({ date: DateTime.fromISO(point.date), balanceCents: parseMoneyCents(point.balance) }));
    runInAction(() => {
      this.points = points;
      this.account = account;
    });
  }
}

export default AccountBalanceSeries;
