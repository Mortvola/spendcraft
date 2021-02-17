import { makeAutoObservable, runInAction } from 'mobx';

class UIState {
  constructor(store) {
    this.view = 'home';
    this.selectedCategoryId = null;
    this.selectedPlan = null;

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

  selectPlan(plan) {
    runInAction(() => {
      this.selectedPlan = plan;
    });
  }
}

export default UIState;
