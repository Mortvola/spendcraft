import { StoreInterface } from './Types';

class Overview {
  bills: { id: number, name: string }[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;
  }
}

export default Overview;
