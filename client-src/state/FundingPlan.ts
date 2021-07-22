import { makeAutoObservable } from 'mobx';
import { FundingPlanProps } from '../../common/ResponseTypes';
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

  async update(name: string): Promise<void> {
    this.name = name;
  }
}

export default FundingPlan;
