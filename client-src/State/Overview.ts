import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { BillsResponse, StoreInterface } from './Types';
import Bill from './Bill';

class Overview {
  @observable
  accessor bills: Bill[] = [];

  store: StoreInterface;

  initialized = false;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  async load() {
    const response = await Http.get<BillsResponse>('/api/v1/bills');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      runInAction(() => {
        this.bills = body.map((props) => new Bill(props));

        this.initialized = true;
      });
    }
  }
}

export default Overview;
