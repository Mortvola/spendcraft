import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import {
  AccountInterface,
  CategoryInterface,
  StoreInterface, UIStateInterface, Views,
} from './State';

class UIState implements UIStateInterface {
  view: Views = 'HOME';

  selectedCategory: CategoryInterface | null = null;

  selectedPlanId: number | null = null;

  selectedAccount: AccountInterface | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  setView(view: Views): void {
    runInAction(() => {
      if (view === 'HOME' && this.view === 'HOME') {
        this.selectedCategory = this.store.categoryTree.getCategory(
          this.store.categoryTree.systemIds.unassignedId,
        );
      }
      else {
        this.view = view;
      }
    });
  }

  selectCategory(category: Category | null): void {
    runInAction(() => {
      this.selectedCategory = category;
    });
  }

  selectAccount(account: AccountInterface | null): void {
    runInAction(() => {
      this.selectedAccount = account;
    });
  }

  selectPlanId(planId: number): void {
    runInAction(() => {
      this.selectedPlanId = planId;
    });
  }
}

export default UIState;
