import { makeAutoObservable } from 'mobx';
import { FundingPlanProps } from './ResponseTypes';
import { StoreInterface } from './State';

class FundingPlan {
  id: number;

  name: string;

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanProps) {
    this.id = props.id;
    this.name = props.name;

    makeAutoObservable(this);

    this.store = store;
  }
}

export default FundingPlan;
