import { makeAutoObservable, runInAction } from 'mobx';

class UIState {
  view = 'home';

  selectedCategoryId: number | null = null;

  selectedPlanId: number | null = null;

  store: unknown;

  constructor(store: unknown) {
    makeAutoObservable(this);

    this.store = store;
  }

  setView(view: string): void {
    runInAction(() => {
      this.view = view;
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
