import { makeAutoObservable } from 'mobx';
import { FundingPlanCategoryProps } from '../../common/ResponseTypes';
import { StoreInterface } from './State';

class FundingPlanCategory {
  id: number;

  amount: number;

  categoryId: number;

  name: string;

  constructor(store: StoreInterface, props: FundingPlanCategoryProps) {
    this.id = props.id;

    this.amount = props.amount;

    this.categoryId = props.categoryId;

    this.name = props.name;

    makeAutoObservable(this);
  }
}

export default FundingPlanCategory;
