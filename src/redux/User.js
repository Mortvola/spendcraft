import { makeAutoObservable, runInAction } from 'mobx';

class User {
  constructor(store) {
    this.username = null;

    makeAutoObservable(this);

    this.store = store;
  }

  async load() {
    const response = await fetch('/user');

    if (response.ok) {
      const body = await response.json();

      runInAction(() => {
        this.username = body.username;
      });
    }
  }
}

export default User;
