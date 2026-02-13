import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { isPlaidLogProps, isWebhookLogProps, PlaidLogsResponse, StoreInterface } from './Types';
import PlaidLog from './PlaidLog';
import WebhookLog from './WebhookLog';

class PlaidLogs {
  @observable
  accessor logs: (PlaidLog | WebhookLog )[] = [];

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
        this.logs = body.map((props) => {
          if (isPlaidLogProps(props)) {
            return new PlaidLog(props)
          }

          if (isWebhookLogProps(props)) {
            return new WebhookLog(props)
          }

          throw new Error('unknown log type')
        });

        this.initialized = true;
      });
    }
  }
}

export default PlaidLogs;
