import { createContext } from 'react';
import Accounts from './Accounts';
import Balances from './Balances';
import CategoryTree from './CategoryTree';
import Register from './Register';
import Reports from './Reports';
import UIState from './UIState';
import User from './User';

class Store {
  constructor() {
    this.user = new User(this);
    this.categoryTree = new CategoryTree(this);
    this.register = new Register(this);
    this.accounts = new Accounts(this);
    this.balances = new Balances(this);
    this.uiState = new UIState(this);
    this.reports = new Reports(this);
  }
}

const store = new Store();
const MobxStore = createContext(store);

store.user.load();
store.categoryTree.load();
store.accounts.load();

export default MobxStore;
export { store };
