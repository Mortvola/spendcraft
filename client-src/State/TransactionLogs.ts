import Http from '@mortvola/http';
import { observable, runInAction } from 'mobx';
import { StoreInterface, TransactionLogsResponse } from './Types';
import TransactionLog from './TransactionLog';

class TransactionLogs {
  @observable
  accessor logs: TransactionLog[] = [];

  store: StoreInterface;

  initialized = false;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async load() {
    const response = await Http.get<TransactionLogsResponse>('/api/v1/transaction-logs');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      runInAction(() => {
        this.logs = body.map((props) => new TransactionLog(props));

        this.initialized = true;
      });
    }
  }
}

export default TransactionLogs;
