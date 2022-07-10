import { RebalancesInterface, StoreInterface } from './State';
import TransactionContainer from './TransactionContainer';

class Rebalances extends TransactionContainer implements RebalancesInterface {
  constructor(store: StoreInterface) {
    super(store, '/api/rebalances');
  }
}

export default Rebalances;
