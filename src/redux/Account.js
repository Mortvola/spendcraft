import { makeAutoObservable } from 'mobx';

class Account {
  constructor(props) {
    this.id = props.id || null;
    this.name = props.name || null;
    this.tracking = props.tracking || null;

    makeAutoObservable(this);
  }
}

export default Account;
