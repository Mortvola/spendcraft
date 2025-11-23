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
        this.bills = body.map((props) => {
          const category = this.store.categoryTree.getCategory(props.id)

          if (!category) {
            throw new Error(`category not found for bill id ${props.id}`)
          }

          return new Bill(props, category)
        });

        this.initialized = true;
      });
    }
  }
}

export default Overview;
