import { makeAutoObservable, runInAction } from 'mobx';

class Plaid {
  constructor() {
    this.displayDialog = false;
    this.updateMode = false;
    this.linkToken = null;

    makeAutoObservable(this);
  }

  showDialog(linkToken, updateMode) {
    runInAction(() => {
      this.linkToken = linkToken;
      this.updateMode = updateMode;
      this.displayDialog = true;
    });
  }

  hideDialog() {
    runInAction(() => {
      this.displayDialog = false;
    });
  }
}

export default Plaid;
