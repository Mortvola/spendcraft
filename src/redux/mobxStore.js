import { createContext } from 'react';
import Accounts from './Accounts';
import CategoryTree from './CategoryTree';
import Register from './Register';

const store = {
  categoryTree: new CategoryTree(),
  register: new Register(),
  accounts: new Accounts(),
};

const MobxStore = createContext(store);

store.categoryTree.load();
store.accounts.load();

export default MobxStore;
export { store };
