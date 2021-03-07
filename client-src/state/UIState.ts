import { makeAutoObservable, runInAction } from 'mobx';
import { StoreInterface, UIStateInterface, Views } from './State';

class UIState implements UIStateInterface {
  view: Views = 'HOME';

  selectedCategoryId: number | null = null;

  selectedPlanId: number | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  setView(view: Views): void {
    runInAction(() => {
      if (view === 'HOME' && this.view === 'HOME') {
        this.selectedCategoryId = this.store.categoryTree.systemIds.unassignedId;
      }
      else {
        this.view = view;
      }
    });
  }

  selectCategory(categoryId: number): void {
    runInAction(() => {
      this.selectedCategoryId = categoryId;
    });
  }

  selectPlanId(planId: number): void {
    runInAction(() => {
      this.selectedPlanId = planId;
    });
  }
}

export default UIState;
