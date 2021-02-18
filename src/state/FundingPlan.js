import { makeAutoObservable } from 'mobx';

class FundingPlan {
  constructor(store, props) {
    this.id = props.id;
    this.name = props.name;

    makeAutoObservable(this);

    this.store = store;
  }
}

export default FundingPlan;
