import { makeAutoObservable } from "mobx";

class FundingPlanGroup {
  constructor(store, props) {
    this.id = props.id;
    this.categories = props.categories;
    this.name = props.name;
    this.system = props.system;

    makeAutoObservable(this);

    this.store = store;
  }
}

export default FundingPlanGroup;
