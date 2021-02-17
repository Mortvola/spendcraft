import { createContext } from 'react';
import Accounts from './Accounts';
import Balances from './Balances';
import CategoryTree from './CategoryTree';
import Register from './Register';
import UIState from './UIState';

class Store {
  constructor() {
    this.categoryTree = new CategoryTree(this);
    this.register = new Register(this);
    this.accounts = new Accounts(this);
    this.balances = new Balances(this);
    this.uiState = new UIState(this);
  }
}

const store = new Store();
const MobxStore = createContext(store);

store.categoryTree.load();
store.accounts.load();

export default MobxStore;
export { store };
