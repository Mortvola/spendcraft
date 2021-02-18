import { makeAutoObservable, runInAction } from 'mobx';

class UIState {
  constructor(store) {
    this.view = 'home';
    this.selectedCategoryId = null;
    this.selectedPlanId = null;

    makeAutoObservable(this);

    this.store = store;
  }

  setView(view) {
    runInAction(() => {
      this.view = view;
    });
  }

  selectCategory(categoryId) {
    runInAction(() => {
      this.selectedCategoryId = categoryId;
    });
  }

  selectPlanId(planId) {
    runInAction(() => {
      this.selectedPlanId = planId;
    });
  }
}

export default UIState;
