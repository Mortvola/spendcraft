import { makeAutoObservable } from 'mobx';

class UIState {
  constructor(store) {
    this.view = 'home';

    makeAutoObservable(this);

    this.store = store;
  }
}

export default UIState;
