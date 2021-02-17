import { makeAutoObservable, runInAction } from 'mobx';

class UIState {
  constructor(store) {
    this.view = 'home';
    this.selectedCategoryId = null;

    makeAutoObservable(this);

    this.store = store;
  }

  selectCategory(categoryId) {
    runInAction(() => {
      this.selectedCategoryId = categoryId;
    });
  }
}

export default UIState;
