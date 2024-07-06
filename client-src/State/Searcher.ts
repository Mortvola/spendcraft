import { StoreInterface } from './Types';
import TransactionContainer from './TransactionContainer';

class Searcher {
  searchString = '';

  transactions: TransactionContainer;

  constructor(store: StoreInterface) {
    this.transactions = new TransactionContainer(store, '/api/v1/transactions/search');
  }
}

export default Searcher;
