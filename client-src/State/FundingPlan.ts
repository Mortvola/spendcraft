import { observable } from 'mobx';
import { FundingPlanProps } from '../../common/ResponseTypes';
import { StoreInterface } from './Types';

class FundingPlan {
  @observable
  accessor id: number;

  @observable
  accessor name: string;

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanProps) {
    this.id = props.id;
    this.name = props.name;

    this.store = store;
  }

  async update(name: string): Promise<void> {
    this.name = name;
  }
}

export default FundingPlan;
