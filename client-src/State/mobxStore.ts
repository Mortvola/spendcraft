import { createContext, useContext } from 'react';
import Accounts from './Accounts';
import Balances from './Balances';
import CategoryTree from './CategoryTree';
import Register from './Register';
import Reports from './Reports';
import UIState from './UIState';
import User from './User';
import Plans from './Plans';
import {
  AccountsInterface, StoreInterface, UIStateInterface,
} from './State';

class Store implements StoreInterface {
  user: User;

  categoryTree: CategoryTree;

  register: Register;

  accounts: AccountsInterface;

  balances: Balances;

  uiState: UIStateInterface;

  reports: Reports;

  plans: Plans;

  constructor() {
    this.user = new User(this);
    this.categoryTree = new CategoryTree(this);
    this.register = new Register(this);
    this.accounts = new Accounts(this);
    this.balances = new Balances(this);
    this.uiState = new UIState(this);
    this.reports = new Reports(this);
    this.plans = new Plans(this);
  }
}

const store = new Store();
const StoreContext = createContext(store);

store.user.load();
store.categoryTree.load();
store.accounts.load();

const useStores = (): Store => (
  useContext(StoreContext)
);

export { StoreContext, store, useStores };
