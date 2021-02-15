import { createContext } from 'react';
import CategoryTree from './CategoryTree';

const store = {
  categoryTree: new CategoryTree(),
};

const MobxStore = createContext(store);

store.categoryTree.load();

export default MobxStore;
export { store };
