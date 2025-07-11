import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { PlaidLogsResponse, StoreInterface } from './Types';
import PlaidLog from './PlaidLog';

class PlaidLogs {
  @observable
  accessor logs: PlaidLog[] = [];

  store: StoreInterface;

  initialized = false;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async load() {
    const response = await Http.get<PlaidLogsResponse>('/api/v1/admin/plaid-logs');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      runInAction(() => {
        this.logs = body.map((props) => new PlaidLog(props));

        this.initialized = true;
      });
    }
  }
}

export default PlaidLogs;
