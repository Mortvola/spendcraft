import { RebalancesInterface, StoreInterface } from './State';
import TransactionContainer from './TransactionContainer';

class Rebalances extends TransactionContainer implements RebalancesInterface {
  constructor(store: StoreInterface) {
    super(store, '/api/v1/rebalances');
  }
}

export default Rebalances;
