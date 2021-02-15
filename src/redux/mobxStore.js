import { createContext } from 'react';
import CategoryTree from './CategoryTree';
import Register from './Register';

const store = {
  categoryTree: new CategoryTree(),
  register: new Register(),
};

const MobxStore = createContext(store);

store.categoryTree.load();

export default MobxStore;
export { store };
